import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[name] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId, storageBucket: `${projectId}.appspot.com` });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getMetadata, getDownloadURL, getBytes, deleteObject } = require('firebase/storage');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'), [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(path.join(root, 'firestore.rules'), 'utf8') }, storage: { host: storageHost, port: Number(storagePort), rules: await readFile(path.join(root, 'storage.rules'), 'utf8') } });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runManageSavedSounds, manageSavedSounds } = await import('../functions/lib/soundSaved.js');
const { runReadSoundLibrary } = await import('../functions/lib/soundUpload.js');
const uid = 'saved-viewer', author = 'saved-author', profile = value => `profile-${value}`, hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
let groups = 0, rules = 0, sequence = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
const input = (action, extra = {}, user = uid) => ({ action, expectedOwnerUid: user, expectedProfileId: profile(user), ...extra });
const call = (action, extra, user = uid) => runManageSavedSounds(db, user, input(action, extra, user));
const set = (soundId, saved = true, requestId = `action-${sequence++}`) => call('set', { soundId, saved, requestId });
async function seedSound(id = hash(sequence++)) {
  await db.doc(`_sound_uploads/${id}`).set({ version: 1, upload_id: id, owner_uid: author, profile_id: profile(author), status: 'published', source_path: `sound-uploads/${author}/${id}/source`, byte_size: 100, content_type: 'audio/wav', source_sha256: 'a'.repeat(64), expires_at_ms: Date.now() + 60000, object_path: `original-sounds/${author}/${id}/00000000-0000-4000-8000-000000000000.wav`, generation: '1', download_token: '00000000-0000-4000-8000-000000000000', published_at_ms: Date.now() });
  await db.doc(`sounds/${id}`).set({ publication_version: 1, sound_id: id, owner_uid: author, uploader_id: profile(author), title: 'Synthetic saved sound', artist: 'Synthetic author', status: 'published', is_approved: true, moderation_status: 'not_reviewed', object_path: `original-sounds/${author}/${id}/00000000-0000-4000-8000-000000000000.wav`, generation: '1', duration: 0.5, tags: [], created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return id;
}
try {
  await env.clearFirestore();
  for (const value of [uid, author, 'outsider']) { await db.doc(`profiles/${profile(value)}`).set({ user_id: value, username: value }); await db.doc(`user_auth_index/${value}`).set({ profile_id: profile(value) }); }
  const id = await seedSound();
  await check('requires authentication, strict current identity and bounded action contracts', async () => {
    await assert.rejects(manageSavedSounds.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(runManageSavedSounds(db, uid, input('status', { soundId: id }, author)), { code: 'failed-precondition' });
    await assert.rejects(call('set', { soundId: id, saved: true, requestId: 'x', owner_uid: author }), { code: 'invalid-argument' });
    await db.doc(`profiles/${uid}`).set({ user_id: author }); await assert.rejects(call('list'), { code: 'failed-precondition' }); await db.doc(`profiles/${uid}`).delete();
  });
  await check('saves once through duplicate and concurrent retries, with canonical ownership', async () => {
    await Promise.all([set(id, true, 'save-first'), set(id, true, 'save-first')]); const row = (await db.doc(`_saved_sound_refs/${hash([uid, id])}`).get()).data(); assert.equal(row.owner_uid, uid); assert.equal(row.profile_id, profile(uid)); assert.equal(row.active, true);
    assert.equal((await db.doc(`_saved_sound_limits/${uid}`).get()).data().active, 1); assert.equal((await call('status', { soundId: id })).saved, true);
    assert.equal((await runReadSoundLibrary(db, uid, input('get', { soundId: id }))).sounds[0].is_saved, true);
  });
  await check('lost-response save replay cannot resurrect a later removal', async () => {
    await set(id, false, 'remove-first'); assert.equal((await set(id, true, 'save-first')).saved, false); assert.equal((await call('status', { soundId: id })).saved, false);
    await set(id, true, 'save-new'); assert.equal((await set(id, false, 'remove-first')).saved, true);
    await assert.rejects(set(id, false, 'save-first'), { code: 'already-exists' });
  });
  await check('current blocks and moderation hide content while retaining removable owned references', async () => {
    await db.doc('blocked_users/saved-block').set({ blocker_id: profile(author), blocked_id: uid }); let list = await call('list'); assert.equal(list.entries.length, 1); assert.equal(list.entries[0].sound, null);
    await assert.rejects(set(id), { code: 'failed-precondition' }); await set(id, false); assert.equal((await call('list')).entries.length, 0); await db.doc('blocked_users/saved-block').delete(); await set(id);
    await db.doc(`sounds/${id}`).update({ moderation_status: 'removed' }); assert.equal((await call('list')).entries[0].sound, null); await set(id, false); await assert.rejects(set(id), { code: 'failed-precondition' });
    await db.doc(`sounds/${id}`).update({ moderation_status: 'not_reviewed' }); await set(id); await db.doc(`sounds/${id}`).delete(); assert.equal((await call('list')).entries[0].sound, null); await set(id, false);
  });
  await check('legacy UID/profile references expose no old payload or authority and remove deliberately', async () => {
    await db.doc('user_saved_sounds/legacy-one').set({ user_id: uid, sound_id: 'legacy-id', title: 'PRIVATE OLD TITLE', audio_url: 'https://private.invalid/file' });
    await db.doc('user_saved_sounds/legacy-two').set({ user_id: profile(uid), sound_id: id });
    await db.doc('user_saved_sounds/foreign').set({ user_id: author, sound_id: id });
    const list = await call('list'); assert.equal(list.entries.length, 2); assert.ok(list.entries.every(entry => entry.legacy && entry.sound === null && entry.soundId === null)); assert.ok(!JSON.stringify(list).includes('PRIVATE OLD TITLE'));
    await assert.rejects(call('removeLegacy', { referenceId: 'foreign', requestId: 'foreign-remove' }), { code: 'not-found' });
    await call('removeLegacy', { referenceId: 'legacy-one', requestId: 'remove-legacy' }); await call('removeLegacy', { referenceId: 'legacy-one', requestId: 'remove-legacy' }); assert.equal((await db.doc('user_saved_sounds/legacy-one').get()).exists, false);
    assert.equal((await db.doc('user_saved_sounds/foreign').get()).exists, true);
    await db.doc('user_saved_sounds/legacy-one').set({ user_id: uid }); assert.equal((await call('removeLegacy', { referenceId: 'legacy-one', requestId: 'remove-legacy' })).removed, false);
    assert.equal((await db.doc('user_saved_sounds/legacy-one').get()).exists, true); await call('removeLegacy', { referenceId: 'legacy-one', requestId: 'remove-recreated-legacy' });
  });
  await check('opaque pages bind account, scope and expiry, including an empty next page', async () => {
    for (let index = 0; index < 26; index++) await set(await seedSound());
    const first = await call('list'); assert.equal(first.entries.length, 25); assert.match(first.nextCursor, /^[a-f0-9]{32}$/); const second = await call('list', { cursor: first.nextCursor }); assert.equal(second.entries.length, 1); assert.match(second.nextCursor, /^[a-f0-9]{32}$/); const old = await call('list', { cursor: second.nextCursor }); assert.equal(old.entries[0].legacy, true);
    await assert.rejects(call('list', { cursor: first.nextCursor }, author), { code: 'failed-precondition' });
    await assert.rejects(runReadSoundLibrary(db, uid, input('list', { kind: 'new', cursor: first.nextCursor })), { code: 'failed-precondition' });
    await db.doc(`_sound_library_cursors/${first.nextCursor}`).update({ expires_at_ms: 0 }); await assert.rejects(call('list', { cursor: first.nextCursor }), { code: 'failed-precondition' });
  });
  await check('direct clients cannot read or forge references, receipts, counters or old raw rows', async () => {
    for (const context of [env.authenticatedContext(uid), env.authenticatedContext(author), env.authenticatedContext('admin', { admin: true }), env.unauthenticatedContext()]) for (const collection of ['_saved_sound_refs', '_saved_sound_requests', '_saved_sound_limits', 'user_saved_sounds']) {
      const reference = doc(context.firestore(), collection, 'fixture'); for (const action of [() => getDoc(reference), () => setDoc(reference, { owner_uid: uid, active: true }), () => updateDoc(reference, { owner_uid: author }), () => deleteDoc(reference)]) { await assertFails(action()); rules++; }
    }
  });
  await check('bounded active library and change quota cannot be exceeded', async () => {
    const next = await seedSound(); await db.doc(`_saved_sound_limits/${uid}`).set({ day: new Date().toISOString().slice(0, 10), requests: 100, active: 500 }); await assert.rejects(set(next), { code: 'resource-exhausted' });
    await db.doc(`_saved_sound_limits/${uid}`).update({ requests: 200, active: 20 }); await assert.rejects(set(next), { code: 'resource-exhausted' });
  });
  console.log(`Saved sounds: ${groups} backend groups, ${rules} rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
