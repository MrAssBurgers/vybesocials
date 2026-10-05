import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { seedPostPublication } from './helpers/post-publication-fixture.mjs';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):(8386|8387)$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { readPostCommentsPage, readPostCommentCountsPage, readCommentContextPage, runManagePostComment } = await import('../functions/lib/_shared/commentAuthority.js');
const { readPostComments, managePostComment } = await import('../functions/lib/comments.js');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const now = Date.parse('2026-10-04T12:00:00.000Z');
const alice = { uid: 'comment-alice', profile: 'comment-alice-profile' }, bob = { uid: 'comment-bob', profile: 'comment-bob-profile' }, charlie = { uid: 'comment-charlie', profile: 'comment-charlie-profile' };
const binding = who => ({ expectedOwnerUid: who.uid, expectedProfileId: who.profile });
const change = (who, fields, time = now) => runManagePostComment(db, who.uid, { ...binding(who), requestId: randomUUID(), postId: 'comment-post', ...fields }, time);
const read = (who = alice, fields = {}, time = now) => readPostCommentsPage(db, who.uid, { ...binding(who), postId: 'comment-post', ...fields }, time);
const counts = (who = alice, fields = {}) => readPostCommentCountsPage(db, who.uid, { ...binding(who), postIds: ['comment-post'], ...fields });
const seedProfile = async who => {
  await db.doc(`profiles/${who.profile}`).set({ user_id: who.uid, username: who.uid, email: 'PRIVATE@invalid.test', is_private: false });
  await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profile });
};
const postRef = db.doc('posts/comment-post'), blockRef = db.doc('blocked_users/comment-block');
const seedPost = (fields = {}, id = 'comment-post') => seedPostPublication(db, id, { author_id: bob.profile, type: 'post', caption: 'Visible parent', created_at: new Date(now - 10000).toISOString(), visibility: 'public', ...fields }, { uid: bob.uid, profileId: bob.profile });
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
try {
  for (const who of [alice, bob, charlie]) await seedProfile(who);
  await seedPost();
  await check('authentication and bound canonical identity are required before all data access', async () => {
    for (const callable of [readPostComments, managePostComment]) await assert.rejects(callable.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(read(alice, { expectedOwnerUid: bob.uid }), { code: 'failed-precondition' });
    await assert.rejects(read(alice, { expectedProfileId: bob.profile }), { code: 'failed-precondition' });
    await assert.rejects(read(alice, { admin: true }), { code: 'invalid-argument' });
    await assert.rejects(read(alice, { cursor: '../bad' }), { code: 'invalid-argument' });
  });
  let first;
  await check('a committed comment has protected provenance and a projected author without private fields', async () => {
    first = await change(charlie, { action: 'create', text: 'Hello discussion', imageUrl: null });
    const page = await read(); assert.equal(page.comments.length, 1); assert.equal(page.comments[0].user.id, charlie.profile);
    assert.equal(page.comments[0].revision, first.revision); assert.equal(page.comments[0].needsOwnerConfirmation, false);
    assert.ok(!JSON.stringify(page).includes('PRIVATE')); assert.ok(!JSON.stringify(page).includes('owner_uid'));
    const proof = (await db.doc(`_comment_authority/${first.commentId}`).get()).data(); assert.equal(proof.owner_uid, charlie.uid); assert.match(proof.source_fingerprint, /^[a-f0-9]{64}$/);
  });
  await check('parent privacy, section visibility and current friendship are checked for every read', async () => {
    await seedPost({ visibility: 'friends' }); await assert.rejects(read(), { code: 'permission-denied' });
    const friend = db.doc('friend_requests/comment-friend'); await friend.set({ sender_id: alice.uid, receiver_id: bob.profile, status: 'accepted' });
    assert.equal((await read()).comments.length, 1); await friend.delete(); await assert.rejects(read(), { code: 'permission-denied' });
    await seedPost(); await db.doc(`profile_visibility/${bob.profile}`).set({ fields: { posts: 'only_me' } });
    await assert.rejects(read(), { code: 'permission-denied' }); assert.equal((await read(bob)).comments.length, 1);
    await db.doc(`profile_visibility/${bob.profile}`).delete();
    await db.doc(`profiles/${bob.profile}`).update({ is_private: true }); await assert.rejects(read(), { code: 'permission-denied' });
    await db.doc(`profiles/${bob.profile}`).update({ is_private: false });
  });
  await check('bilateral post-author blocks deny the discussion; commenter blocks remove their content and reactions', async () => {
    for (const [blocker_id, blocked_id] of [[alice.uid, bob.profile], [bob.uid, alice.profile]]) {
      await blockRef.set({ blocker_id, blocked_id }); await assert.rejects(read(), { code: 'permission-denied' }); await blockRef.delete();
    }
    for (const [blocker_id, blocked_id] of [[alice.uid, charlie.profile], [charlie.uid, alice.profile]]) {
      await blockRef.set({ blocker_id, blocked_id }); assert.equal((await read()).comments.length, 0);
      await assert.rejects(change(alice, { action: 'like', commentId: first.commentId, liked: true }), { code: 'permission-denied' }); await blockRef.delete();
    }
  });
  await check('deleted, removed, hidden, unapproved or malformed parents disclose neither text nor counts', async () => {
    for (const patch of [{ is_deleted: true }, { deleted_at: 'now' }, { is_hidden: true }, { status: 'draft' }, { moderation_status: 'pending' }, { visibility: 'made-up' }, { author_id: 'missing' }]) {
      await seedPost(patch); await assert.rejects(read(), { code: 'permission-denied' }); assert.deepEqual((await counts()).counts, []);
    }
    await postRef.delete(); await assert.rejects(read(), { code: 'permission-denied' }); await seedPost();
  });
  await check('legacy reassignment is visible only to its claimed owner, never auto-attested, and needs an explicit save', async () => {
    const legacy = db.doc('comments/legacy-forged');
    await legacy.set({ user_id: alice.profile, post_id: 'comment-post', text: 'Forged legacy authorship', image_url: null, created_at: new Date(now - 3000).toISOString() });
    assert.equal((await read(bob)).comments.some(row => row.id === legacy.id), false);
    const own = (await read()).comments.find(row => row.id === legacy.id); assert.equal(own.needsOwnerConfirmation, true); assert.equal(own.revision, null);
    assert.equal((await db.doc(`_comment_authority/${legacy.id}`).get()).exists, false);
    const confirmed = await change(alice, { action: 'edit', commentId: legacy.id, expectedRevision: null, text: 'My deliberate replacement' });
    assert.equal((await read(bob)).comments.find(row => row.id === legacy.id).text, 'My deliberate replacement');
    await legacy.update({ text: 'Changed without a matching source proof' });
    assert.equal((await read(bob)).comments.some(row => row.id === legacy.id), false);
    await assert.rejects(change(alice, { action: 'edit', commentId: legacy.id, expectedRevision: confirmed.revision, text: 'Stale edit' }), { code: 'aborted' });
    await change(alice, { action: 'delete', commentId: legacy.id, expectedRevision: null });
    await legacy.set({ user_id: alice.profile, post_id: 'comment-post', text: 'Old content resurrected', created_at: new Date(now).toISOString() });
    assert.equal((await read()).comments.some(row => row.id === legacy.id), false); await legacy.delete();
  });
  await check('create retry and later edit/delete receipts never duplicate or resurrect old content', async () => {
    const requestId = randomUUID(), fields = { action: 'create', requestId, text: 'Retry me', imageUrl: null };
    const created = await change(alice, fields); assert.deepEqual(await change(alice, fields), created);
    await assert.rejects(change(alice, { ...fields, text: 'Changed payload' }), { code: 'already-exists' });
    const editFields = { action: 'edit', requestId: randomUUID(), commentId: created.commentId, expectedRevision: created.revision, text: 'First edit' };
    const edited = await change(alice, editFields);
    const newer = await change(alice, { ...editFields, requestId: randomUUID(), expectedRevision: edited.revision, text: 'Later edit' });
    assert.deepEqual(await change(alice, editFields), edited); assert.equal((await db.doc(`comments/${created.commentId}`).get()).data().text, 'Later edit');
    await assert.rejects(change(alice, { action: 'delete', commentId: created.commentId, expectedRevision: created.revision }), { code: 'aborted' });
    const deletion = { action: 'delete', requestId: randomUUID(), commentId: created.commentId, expectedRevision: newer.revision };
    const deleted = await change(alice, deletion); assert.deepEqual(await change(alice, deletion), deleted);
    assert.deepEqual(await change(alice, fields), created); assert.equal((await db.doc(`comments/${created.commentId}`).get()).exists, false);
    await assert.rejects(change(alice, { ...deletion, requestId: randomUUID() }), { code: 'permission-denied' });
  });
  await check('every mutation and receipt replay rechecks current parent access and owner identity', async () => {
    const fields = { action: 'create', requestId: randomUUID(), text: 'Current permissions', imageUrl: null };
    const own = await change(alice, fields);
    await assert.rejects(change(bob, { action: 'edit', commentId: own.commentId, expectedRevision: own.revision, text: 'Not mine' }), { code: 'permission-denied' });
    await seedPost({ visibility: 'only_me' });
    for (const mutation of [fields, { action: 'create', text: 'New hidden parent', imageUrl: null },
      { action: 'edit', commentId: own.commentId, expectedRevision: own.revision, text: 'Hidden edit' }, { action: 'delete', commentId: own.commentId, expectedRevision: own.revision },
      { action: 'like', commentId: first.commentId, liked: true }]) await assert.rejects(change(alice, mutation), { code: 'permission-denied' });
    await seedPost();
  });
  await check('schema validation rejects oversized text, bad URLs, unknown fields and forged revisions', async () => {
    for (const patch of [{ text: 'x'.repeat(4001) }, { text: '' }, { imageUrl: 'http://example.test/x.gif' }, { text: 'contains\u0000control' },
      { user_id: bob.profile }, { safetyScore: -1 }, { safetyCategories: [null] }, { requestId: 'not-a-uuid' }]) {
      await assert.rejects(change(alice, { action: 'create', text: 'Valid', imageUrl: null, ...patch }), { code: 'invalid-argument' });
    }
    await assert.rejects(change(charlie, { action: 'edit', commentId: first.commentId, expectedRevision: 'forged', text: 'New text' }), { code: 'invalid-argument' });
  });
  await check('likes have checked desired state and stable receipts without legacy duplicates', async () => {
    await db.doc('comment_likes/legacy-like').set({ user_id: alice.uid, comment_id: first.commentId });
    const fields = { action: 'like', commentId: first.commentId, requestId: randomUUID(), liked: true };
    const liked = await change(alice, fields); assert.deepEqual(await change(alice, fields), liked);
    let row = (await read()).comments.find(value => value.id === first.commentId); assert.equal(row.isLiked, true); assert.equal(row.likeCount, 1);
    await change(alice, { ...fields, requestId: randomUUID(), liked: false }); row = (await read()).comments.find(value => value.id === first.commentId); assert.equal(row.isLiked, false);
  });
  await check('opaque cursors are parent/account bound and advance past withheld legacy pages', async () => {
    await seedPost({}, 'comment-paged-post');
    const batch = db.batch();
    for (let i = 0; i < 23; i++) batch.set(db.doc(`comments/comment-page-${i.toString().padStart(2, '0')}`), { user_id: charlie.profile, post_id: 'comment-paged-post', text: 'Legacy candidate', created_at: new Date(now - 10000 + i).toISOString() });
    await batch.commit();
    const firstPage = await read(alice, { postId: 'comment-paged-post' }); assert.deepEqual(firstPage.comments, []); assert.match(firstPage.nextCursor, /^[a-f0-9]{48}$/);
    const secondPage = await read(alice, { postId: 'comment-paged-post', cursor: firstPage.nextCursor }); assert.deepEqual(secondPage.comments, []); assert.equal(secondPage.nextCursor, null);
    for (const [who, fields, time] of [[bob, { postId: 'comment-paged-post' }, now], [alice, {}, now], [alice, { postId: 'comment-paged-post' }, now + 600001]])
      await assert.rejects(read(who, { ...fields, cursor: firstPage.nextCursor }, time), { code: 'failed-precondition' });
    const ownPage = await read(charlie, { postId: 'comment-paged-post' }); assert.equal(ownPage.comments.length, 20);
  });
  await check('counts and comment navigation are freshly admitted and never return raw authorship', async () => {
    const result = await counts(); assert.equal(result.counts.length, 1); assert.ok(result.counts[0].count >= 1);
    assert.equal((await counts(alice, { since: new Date(now + 1).toISOString() })).counts[0].count, 0);
    const context = () => readCommentContextPage(db, alice.uid, { ...binding(alice), commentId: first.commentId });
    assert.equal((await context()).postId, 'comment-post'); await postRef.update({ is_deleted: true }); assert.equal((await context()).postId, null); await seedPost();
  });
  await check('canonical UID/profile collisions cannot read, replace or adopt a foreign comment', async () => {
    await db.doc(`profiles/${alice.uid}`).set({ user_id: 'another-owner', username: 'Collision' });
    await assert.rejects(read(), { code: 'failed-precondition' });
    await assert.rejects(change(alice, { action: 'create', text: 'Collision', imageUrl: null }), { code: 'failed-precondition' });
    const auth = env.authenticatedContext(alice.uid).firestore(); await assertFails(getDoc(doc(auth, 'comments', first.commentId)));
    await db.doc(`profiles/${alice.uid}`).delete();
  });
  await check('rules deny raw other-user comments, direct interactions and forged protected authority while preserving own/staff reads', async () => {
    const a = env.authenticatedContext(alice.uid).firestore(), c = env.authenticatedContext(charlie.uid).firestore(), staff = env.authenticatedContext('comment-staff', { admin: true }).firestore();
    await assertFails(getDoc(doc(a, 'comments', first.commentId))); await assertFails(getDocs(query(collection(a, 'comments'), where('post_id', '==', 'comment-post'))));
    await assertSucceeds(getDoc(doc(c, 'comments', first.commentId))); await assertSucceeds(getDocs(query(collection(c, 'comments'), where('user_id', '==', charlie.profile))));
    await assertSucceeds(getDoc(doc(staff, 'comments', first.commentId)));
    await assertFails(setDoc(doc(a, 'comments', 'direct-comment'), { user_id: alice.profile, post_id: 'comment-post', text: 'Bypass' }));
    await assertFails(updateDoc(doc(c, 'comments', first.commentId), { text: 'Bypass' })); await assertFails(deleteDoc(doc(c, 'comments', first.commentId)));
    await assertFails(setDoc(doc(a, 'comment_likes', 'forged-like'), { user_id: alice.profile, comment_id: first.commentId }));
    for (const table of ['_comment_authority', '_comment_receipts', '_comment_cursors']) {
      await assertFails(getDoc(doc(a, table, first.commentId))); await assertFails(setDoc(doc(a, table, first.commentId), { owner_uid: alice.uid }));
    }
  });
  console.log(`PASS ${checks} comment authority groups`);
} finally { await env.cleanup(); await db.terminate(); }
