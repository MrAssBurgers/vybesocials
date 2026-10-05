import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(path.join(root, 'firestore.rules'), 'utf8') } });
const { db } = await import('../functions/lib/_shared/admin.js');
const { runManagePost } = await import('../functions/lib/_shared/postPublicationAuthority.js');
const { recordPostViewFor } = await import('../functions/lib/_shared/postViewAuthority.js');
const { publicationHash } = await import('../functions/lib/_shared/postPublicationProof.js');
const { recordPostView } = await import('../functions/lib/postViews.js');
const alice = { uid: 'views-alice', profileId: 'views-profile-alice' }, bob = { uid: 'views-bob', profileId: 'views-profile-bob' }, carol = { uid: 'views-carol', profileId: 'views-profile-carol' };
const binding = actor => ({ expectedOwnerUid: actor.uid, expectedProfileId: actor.profileId });
const time = Date.UTC(2026, 9, 4, 12, 12), hour = Math.floor(time / 3600000);
const create = async (patch = {}) => runManagePost(db, alice.uid, { ...binding(alice), action: 'create', postId: randomUUID(), requestId: randomUUID(), payload: { type: 'post', caption: 'Synthetic post view fixture', tags: [], mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'unrated', visibility: 'public', ...patch } }, time);
const view = (actor, postId, now = time) => recordPostViewFor(db, actor.uid, { ...binding(actor), postId }, now);
let groups = 0, rules = 0; const check = async (name, action) => { await action(); groups++; console.log('PASS ' + name); };
try {
  await env.clearFirestore();
  for (const actor of [alice, bob, carol]) { await db.doc(`profiles/${actor.profileId}`).set({ user_id: actor.uid, username: actor.uid, is_private: false }); await db.doc(`user_auth_index/${actor.uid}`).set({ profile_id: actor.profileId }); }
  await check('authentication, exact input and canonical actor are required', async () => {
    await assert.rejects(recordPostView.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(recordPostViewFor(db, bob.uid, { ...binding(alice), postId: 'unknown' }, time), { code: 'failed-precondition' });
    await assert.rejects(recordPostViewFor(db, bob.uid, { ...binding(bob), postId: '../unknown' }, time), { code: 'invalid-argument' });
    await assert.rejects(recordPostViewFor(db, bob.uid, { ...binding(bob), postId: 'unknown', count: 999 }, time), { code: 'invalid-argument' });
    await assert.rejects(recordPostViewFor(db, bob.uid, { ...binding(bob), expectedProfileId: alice.profileId, postId: 'unknown' }, time), { code: 'failed-precondition' });
  });
  const published = await create();
  await check('concurrent views from one account create one hourly receipt and return the current count', async () => {
    const rows = await Promise.all(Array.from({ length: 6 }, () => view(bob, published.postId)));
    assert.equal(rows.filter(row => row.counted).length, 1); assert.ok(rows.every(row => row.viewCount === 1));
    assert.equal((await db.doc(`posts/${published.postId}`).get()).data().view_count, 1);
    const receipt = (await db.doc(`_post_view_receipts/${publicationHash([bob.uid, published.postId, hour])}`).get()).data();
    assert.equal(receipt.viewer_uid, bob.uid); assert.equal(receipt.expireAt.toMillis(), (hour + 2) * 3600000);
  });
  await check('different viewers and new hour count once; replays use current totals rather than old snapshots', async () => {
    assert.equal((await view(carol, published.postId)).viewCount, 2); assert.deepEqual(await view(bob, published.postId), { ok: true, ownerUid: bob.uid, profileId: bob.profileId, postId: published.postId, viewCount: 2, counted: false });
    assert.equal((await view(bob, published.postId, time + 3600000)).viewCount, 3);
  });
  await check('both-direction blocks prevent replay and counter mutation', async () => {
    for (const row of [{ blocker_id: alice.profileId, blocked_id: bob.uid }, { blocker_id: bob.profileId, blocked_id: alice.uid }]) {
      await db.doc('blocked_users/views-block').set(row); await assert.rejects(view(bob, published.postId), { code: 'permission-denied' }); await db.doc('blocked_users/views-block').delete();
    }
    assert.equal((await db.doc(`posts/${published.postId}`).get()).data().view_count, 3);
  });
  await check('legacy owner-readable rows and forged publication proofs cannot earn views', async () => {
    await db.doc('posts/views-legacy').set({ author_id: alice.profileId, type: 'post', caption: 'Legacy', tags: [], created_at: new Date(time).toISOString(), visibility: 'public' });
    await assert.rejects(view(alice, 'views-legacy'), { code: 'permission-denied' });
    const bad = await create(); await db.doc(`posts/${bad.postId}`).update({ caption: 'Unexpected source mutation' }); await assert.rejects(view(alice, bad.postId), { code: 'permission-denied' });
  });
  await check('audience and author profile visibility are read for every request', async () => {
    const privatePost = await create({ visibility: 'only_me' }); await assert.rejects(view(bob, privatePost.postId), { code: 'permission-denied' }); assert.equal((await view(alice, privatePost.postId)).counted, true);
    await db.doc(`profile_visibility/${alice.profileId}`).set({ user_id: alice.profileId, fields: { posts: 'only_me' } });
    await assert.rejects(view(bob, published.postId), { code: 'permission-denied' }); await db.doc(`profile_visibility/${alice.profileId}`).delete();
  });
  await check('identity aliases cannot borrow another account and missing targets stay absent', async () => {
    await db.doc(`profiles/${bob.uid}`).set({ user_id: carol.uid }); await assert.rejects(view(bob, published.postId), { code: 'failed-precondition' }); await db.doc(`profiles/${bob.uid}`).delete();
    await assert.rejects(view(bob, 'views-missing'), { code: 'permission-denied' }); assert.equal((await db.doc('posts/views-missing').get()).exists, false);
  });
  await check('deletion and concurrent view never resurrect a post or retain admission', async () => {
    const target = await create();
    await Promise.allSettled([view(bob, target.postId), runManagePost(db, alice.uid, { ...binding(alice), action: 'delete', postId: target.postId, requestId: randomUUID(), expectedRevision: target.revision }, time)]);
    assert.equal((await db.doc(`posts/${target.postId}`).get()).exists, false); await assert.rejects(view(bob, target.postId), { code: 'permission-denied' }); assert.equal((await db.doc(`posts/${target.postId}`).get()).exists, false);
  });
  await check('request quota includes duplicate receipts and fails at 60 without changing counters', async () => {
    const minute = Math.floor(time / 60000), ref = db.doc(`_post_view_limits/${publicationHash([carol.uid, minute])}`);
    await ref.set({ version: 1, owner_uid: carol.uid, minute, requests: 59 }); assert.equal((await view(carol, published.postId)).counted, false);
    await assert.rejects(view(carol, published.postId), { code: 'resource-exhausted' }); assert.equal((await ref.get()).data().requests, 60);
    assert.ok((await ref.get()).data().expireAt.toMillis() >= (minute + 1) * 60000 + 3600000);
  });
  await check('clients including owner and staff cannot forge, read or erase private view authority', async () => {
    for (const auth of [env.authenticatedContext(bob.uid), env.authenticatedContext(alice.uid, { admin: true })]) for (const collection of ['_post_view_receipts', '_post_view_limits']) {
      const ref = doc(auth.firestore(), collection, 'forged'); await assertFails(setDoc(ref, { viewer_uid: bob.uid })); await assertFails(getDoc(ref)); await assertFails(deleteDoc(ref)); rules += 3;
    }
  });
  console.log(`Post views: ${groups} backend groups, ${rules} rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
