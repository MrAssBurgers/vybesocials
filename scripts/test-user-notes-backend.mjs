import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { readFriendsNotes, runManageUserNote, getFriendsNotes, manageUserNote } = await import('../functions/lib/userNotes.js');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const now = Date.parse('2026-10-04T12:00:00.000Z');
const alice = { uid: 'note-alice', profile: 'note-alice-profile' }, bob = { uid: 'note-bob', profile: 'note-bob-profile' };
const identity = who => ({ expectedOwnerUid: who.uid, expectedProfileId: who.profile });
const manage = (who, input, time = now) => runManageUserNote(db, who.uid, { ...identity(who), ...input }, time);
const read = (who = alice, input = {}, time = now) => readFriendsNotes(db, who.uid, { ...identity(who), ...input }, time);
const seedProfile = async who => {
  await db.doc(`profiles/${who.profile}`).set({ user_id: who.uid, username: who.uid, display_name: 'Test person', email: 'PRIVATE@invalid.test' });
  await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profile });
};
const seedNote = (who, patch = {}, id = who.uid) => db.doc(`user_notes/${id}`).set({ user_id: who.uid, content: 'A test note', gif_url: null,
  created_at: new Date(now - 1000).toISOString(), expires_at: new Date(now + 86399000).toISOString(), ...patch });
let publication = 0;
const publishNote = async who => {
  const before = await manage(who, { action: 'read' });
  return manage(who, { action: 'save', requestId: `fixture-publish-${publication++}`, expectedRevision: before.revision, content: 'A test note', gifUrl: null });
};
const connection = db.doc('friend_requests/notes-connection');
const block = db.doc('blocked_users/notes-block');
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
try {
  await seedProfile(alice); await seedProfile(bob);
  await check('authentication, owner/profile binding and malformed input fail before data access', async () => {
    for (const callable of [getFriendsNotes, manageUserNote]) await assert.rejects(callable.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(read(alice, { expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(read(alice, { expectedProfileId: bob.profile }), { code: 'failed-precondition' });
    for (const patch of [{ cursor: '../bad' }, { admin: true }, { expectedProfileId: [] }]) await assert.rejects(read(alice, patch), { code: 'invalid-argument' });
  });
  await check('only current accepted friends receive projected notes', async () => {
    await publishNote(bob);
    assert.equal((await read()).notes.length, 0);
    await connection.set({ sender_id: alice.profile, receiver_id: bob.profile, status: 'pending' });
    assert.equal((await read()).notes.length, 0);
    await connection.update({ status: 'accepted' });
    const page = await read(); assert.equal(page.notes.length, 1); assert.equal(page.notes[0].profile.id, bob.profile);
    assert.ok(!JSON.stringify(page).includes('PRIVATE')); assert.equal(page.notes[0].user_id, bob.uid);
    await connection.update({ status: 'rejected' }); assert.equal((await read()).notes.length, 0);
    await connection.set({ sender_id: bob.uid, receiver_id: alice.profile, status: 'accepted' });
    assert.equal((await read()).notes.length, 1);
  });
  await check('blocks in either alias direction remove otherwise accepted notes', async () => {
    for (const [blocker_id, blocked_id] of [[alice.uid, bob.profile], [bob.uid, alice.profile], [bob.profile, alice.uid]]) {
      await block.set({ blocker_id, blocked_id }); assert.equal((await read()).notes.length, 0); await block.delete();
    }
  });
  await check('expired, future, overlong, unsafe GIF, hidden and foreign-profile notes never render', async () => {
    for (const patch of [{ expires_at: new Date(now).toISOString() }, { created_at: new Date(now + 1000).toISOString() },
      { content: 'x'.repeat(61) }, { gif_url: 'javascript:alert(1)' }, { gif_url: 'https://giphy.com.attacker.test/x.gif' },
      { expires_at: new Date(now + 86400001).toISOString() }, { status: 'hidden' }, { is_removed: true }, { profile_id: alice.profile }, { content: '\n' }]) {
      await seedNote(bob, patch); assert.equal((await read()).notes.length, 0, JSON.stringify(patch));
    }
    await seedNote(bob);
  });
  await check('legacy reassignment is not publication authority; only an explicit owner save attests the exact source', async () => {
    const victim = { uid: 'notes-legacy-victim', profile: 'notes-legacy-victim-profile' }; await seedProfile(victim);
    await db.doc('friend_requests/notes-forged-legacy').set({ sender_id: alice.profile, receiver_id: victim.profile, status: 'accepted' });
    // The former client rule allowed an attacker to assign a row to this UID,
    // including plausible schema/status/profile fields and a canonical ID.
    await seedNote(victim, { schema_version: 1, status: 'active', profile_id: victim.profile, content: 'Attacker-created claim' });
    const victimNotes = async () => (await read()).notes.filter(note => note.user_id === victim.uid);
    assert.equal((await victimNotes()).length, 0);
    const legacy = await manage(victim, { action: 'read' }); assert.equal(legacy.note.content, 'Attacker-created claim');
    assert.equal((await db.doc(`_user_note_state/${victim.uid}`).get()).exists, false, 'Reading must not attest a legacy claim');
    // A state row from an earlier server rollout without a source proof is also
    // insufficient, even when its owner and revision fields appear valid.
    await db.doc(`_user_note_state/${victim.uid}`).set({ owner_uid: victim.uid, profile_id: victim.profile, revision: 'a'.repeat(48), count: 1, window_started_at: now });
    assert.equal((await victimNotes()).length, 0);
    const replaced = await manage(victim, { action: 'save', requestId: 'deliberate-replace', expectedRevision: 'a'.repeat(48), content: 'My deliberate note', gifUrl: null });
    assert.equal((await victimNotes())[0]?.content, 'My deliberate note');
    const noteRef = db.doc(`user_notes/${victim.uid}`), stateRef = db.doc(`_user_note_state/${victim.uid}`);
    const attestedRow = (await noteRef.get()).data(), proof = (await stateRef.get()).data();
    assert.equal(proof.note_id, victim.uid); assert.match(proof.source_fingerprint, /^[a-f0-9]{64}$/);
    await noteRef.update({ content: 'Changed after attestation' }); assert.equal((await victimNotes()).length, 0);
    await manage(victim, { action: 'read' }); assert.equal((await victimNotes()).length, 0, 'Own read must not refresh a stale source proof');
    await noteRef.set(attestedRow); assert.equal((await victimNotes()).length, 1);
    await stateRef.update({ revision: 'b'.repeat(48) }); assert.equal((await victimNotes()).length, 0);
    await stateRef.set(proof);
    await manage(victim, { action: 'delete', requestId: 'delete-attestation', expectedRevision: replaced.revision });
    const deleted = (await stateRef.get()).data(); assert.equal(deleted.note_id, null); assert.equal(deleted.source_fingerprint, null);
    await noteRef.set(attestedRow); assert.equal((await victimNotes()).length, 0, 'Old source cannot revive after deletion');
  });
  let first, second;
  await check('own save uses server time, immutable ownership and a checked revision', async () => {
    const before = await manage(alice, { action: 'read' }); assert.equal(before.note, null); assert.equal(before.revision, null);
    first = await manage(alice, { action: 'save', requestId: 'save-first', expectedRevision: null, content: 'Hello friends', gifUrl: null });
    const current = await manage(alice, { action: 'read' }); assert.equal(current.note.content, 'Hello friends'); assert.equal(current.revision, first.revision);
    assert.equal(Date.parse(current.note.expires_at) - Date.parse(current.note.created_at), 86400000);
    assert.equal((await db.doc(`user_notes/${alice.uid}`).get()).data().user_id, alice.uid);
    second = await manage(alice, { action: 'save', requestId: 'save-second', expectedRevision: first.revision, content: 'Newer note', gifUrl: null });
  });
  await check('lost acknowledgement retries do not overwrite a newer note and request reuse is rejected', async () => {
    const replay = await manage(alice, { action: 'save', requestId: 'save-first', expectedRevision: null, content: 'Hello friends', gifUrl: null });
    assert.deepEqual(replay, first); assert.equal((await manage(alice, { action: 'read' })).note.content, 'Newer note');
    await assert.rejects(manage(alice, { action: 'save', requestId: 'save-first', expectedRevision: null, content: 'Changed retry', gifUrl: null }), { code: 'already-exists' });
    await assert.rejects(manage(alice, { action: 'delete', requestId: 'stale-delete', expectedRevision: first.revision }), { code: 'aborted' });
  });
  await check('deletion really removes note content and cannot erase later replacements on retry', async () => {
    const removed = await manage(alice, { action: 'delete', requestId: 'delete', expectedRevision: second.revision });
    assert.equal((await db.doc(`user_notes/${alice.uid}`).get()).exists, false);
    assert.equal((await manage(alice, { action: 'read' })).note, null);
    await manage(alice, { action: 'save', requestId: 'after-delete', expectedRevision: removed.revision, content: 'After delete', gifUrl: null });
    await manage(alice, { action: 'delete', requestId: 'delete', expectedRevision: second.revision });
    assert.equal((await manage(alice, { action: 'read' })).note.content, 'After delete');
  });
  await check('text/source validation and canonical owner collisions never overwrite foreign rows', async () => {
    const before = await manage(alice, { action: 'read' });
    for (const patch of [{ content: '' }, { content: 'x'.repeat(61) }, { content: ' padded ' }, { gifUrl: 'https://example.test/a.gif' }, { expires_at: '2099-01-01' }]) {
      await assert.rejects(manage(alice, { action: 'save', requestId: 'invalid', expectedRevision: before.revision, content: 'Valid', gifUrl: null, ...patch }), { code: 'invalid-argument' });
    }
    const collision = { uid: 'note-collision', profile: 'note-collision-profile' }; await seedProfile(collision);
    await seedNote(bob, {}, collision.uid);
    await assert.rejects(manage(collision, { action: 'save', requestId: 'collision', expectedRevision: null, content: 'No', gifUrl: null }), { code: 'failed-precondition' });
    assert.equal((await db.doc(`user_notes/${collision.uid}`).get()).data().user_id, bob.uid);
    await db.doc(`user_notes/${collision.uid}`).delete();
  });
  await check('legacy single owned note is adopted atomically and ambiguous duplicates fail closed', async () => {
    const owner = { uid: 'note-legacy', profile: 'note-legacy-profile' }; await seedProfile(owner); await seedNote(owner, {}, 'random-note-id');
    const before = await manage(owner, { action: 'read' }); assert.equal(before.note.id, 'random-note-id');
    await manage(owner, { action: 'save', requestId: 'adopt', expectedRevision: before.revision, content: 'Adopted', gifUrl: null });
    assert.equal((await db.doc('user_notes/random-note-id').get()).exists, false);
    await seedNote(owner, {}, 'duplicate-note-id');
    await assert.rejects(manage(owner, { action: 'read' }), { code: 'failed-precondition' });
  });
  await check('notes paginate through current relationships without dropping later friends', async () => {
    const viewer = { uid: 'notes-page', profile: 'notes-page-profile' }; await seedProfile(viewer);
    for (let i = 0; i < 23; i++) {
      const who = { uid: `notes-person-${i}`, profile: `notes-person-profile-${i}` }; await seedProfile(who); await publishNote(who);
      await db.doc(`friend_requests/notes-page-${String(i).padStart(3, '0')}`).set({ sender_id: i % 2 ? viewer.uid : who.profile, receiver_id: i % 2 ? who.profile : viewer.profile, status: 'accepted' });
    }
    const first = await read(viewer); assert.equal(first.notes.length, 20); assert.ok(first.nextCursor);
    const next = await read(viewer, { cursor: first.nextCursor }); assert.equal(next.notes.length, 3); assert.equal(next.nextCursor, null);
    assert.equal(new Set([...first.notes, ...next.notes].map(note => note.user_id)).size, 23);
  });
  await check('direct clients cannot bypass notes admission, reassign owners or restore deleted notes', async () => {
    for (const actor of [env.authenticatedContext(alice.uid), env.authenticatedContext(bob.uid), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
      const client = actor.firestore();
      await assertFails(getDoc(doc(client, 'user_notes', alice.uid)));
      await assertFails(setDoc(doc(client, 'user_notes', 'forged'), { user_id: alice.uid, content: 'Forged' }));
      await assertFails(updateDoc(doc(client, 'user_notes', alice.uid), { user_id: bob.uid }));
      await assertFails(deleteDoc(doc(client, 'user_notes', alice.uid)));
      await assertFails(getDoc(doc(client, '_user_note_state', alice.uid)));
      await assertFails(setDoc(doc(client, '_user_note_state', bob.uid), { owner_uid: bob.uid, profile_id: bob.profile, revision: 'a'.repeat(48), note_id: bob.uid, source_fingerprint: 'b'.repeat(64) }));
      await assertFails(setDoc(doc(client, '_user_note_operations', 'forged'), { success: true }));
    }
  });
} finally { await env.cleanup(); }
console.log(`User notes passed ${checks} backend/rules groups`);
