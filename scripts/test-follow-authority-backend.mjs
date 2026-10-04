import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, deleteDoc, collection, getDocs } = require('firebase/firestore');
const { db } = await import('../functions/lib/_shared/admin.js');
const { manageFollow } = await import('../functions/lib/follow.js');
const { followAuthorityId, manageFollowAuthority } = await import('../functions/lib/_shared/followAuthority.js');
const { readSocialFeedPage } = await import('../functions/lib/_shared/socialFeedAuthority.js');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
const owner = { uid: 'follow-owner', profile: 'follow-owner-profile' }, follower = { uid: 'follow-fan', profile: 'follow-fan-profile' }, other = { uid: 'follow-other', profile: 'follow-other-profile' };
const input = (who, action, extras = {}) => ({ expectedOwnerUid: who.uid, expectedProfileId: who.profile, action, ...extras });
const run = (who, action, extras = {}) => manageFollowAuthority(db, who.uid, input(who, action, extras));
const state = () => run(follower, 'state', { targetId: owner.profile });
const request = async () => run(follower, 'request', { targetId: owner.profile, revision: (await state()).revision });
const relationshipId = followAuthorityId(owner.uid, follower.uid), proof = db.doc(`_follow_authority/${relationshipId}`);
const decide = async action => run(owner, action, { relationshipId, revision: (await state()).revision });
const feed = () => readSocialFeedPage(db, follower.uid, { expectedOwnerUid: follower.uid, expectedProfileId: follower.profile });
let checks = 0;
const check = async (label, fn) => { await fn(); checks++; console.log(`PASS ${label}`); };
try {
  await env.clearFirestore();
  for (const who of [owner, follower, other]) {
    await db.doc(`profiles/${who.profile}`).set({ user_id: who.uid, username: who.uid, is_private: who === owner });
    await db.doc(`user_auth_index/${who.uid}`).set({ profile_id: who.profile });
  }
  await db.doc('posts/private-post').set({ author_id: owner.profile, type: 'post', caption: 'Private moment', media_url: '', created_at: new Date().toISOString() });
  await check('callable rejects guests, account substitution and malformed actions before rate work', async () => {
    await assert.rejects(manageFollow.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(manageFollow.run({ auth: { uid: follower.uid }, data: input(owner, 'list', { view: 'requests' }) }), { code: 'failed-precondition' });
    for (const patch of [{ action: 'approve', relationshipId: 'bad', revision: 0 }, { action: 'list', view: ['requests'] }, { action: 'request', targetId: owner.profile, revision: -1 }, { action: 'request', targetId: owner.profile, revision: 0, approved_by_owner: true }]) {
      await assert.rejects(manageFollowAuthority(db, follower.uid, { ...input(follower, 'state'), ...patch }), { code: 'invalid-argument' });
    }
    assert.equal((await db.collection('_rate_limits').get()).size, 0);
  });
  await check('private request stays pending, emits one request notice and grants no post access', async () => {
    const before = await state(); assert.equal(before.state, 'none');
    const pending = await manageFollow.run({ auth: { uid: follower.uid }, data: input(follower, 'request', { targetId: owner.profile, revision: 0 }) });
    assert.equal(pending.state, 'pending'); assert.equal(pending.revision, 1); assert.equal((await feed()).posts.length, 0);
    assert.equal((await db.collection('follows').get()).size, 0);
    assert.equal((await request()).revision, 1); assert.equal((await db.collection('notifications').get()).size, 1);
    assert.equal((await db.collection('notifications').get()).docs[0].data().type, 'follow_request');
    const list = await run(owner, 'list', { view: 'requests' }); assert.equal(list.relationships[0].follower.id, follower.profile); assert.equal(list.relationships[0].canApprove, true);
  });
  await check('only the owner can approve; stale decisions cannot approve a replacement request', async () => {
    for (const who of [follower, other]) await assert.rejects(run(who, 'approve', { relationshipId, revision: 1 }), { code: 'permission-denied' });
    await decide('decline'); await request();
    await assert.rejects(run(owner, 'approve', { relationshipId, revision: 1 }), { code: 'failed-precondition' });
    assert.equal((await decide('approve')).state, 'following'); assert.equal((await feed()).posts.length, 1);
    assert.equal((await db.collection('follows').get()).size, 1); assert.equal((await proof.get()).data().approved_by_owner, true);
    await assert.rejects(decide('approve'), { code: 'failed-precondition' });
  });
  await check('two-way blocks deny reads and grants but never prevent owner revocation', async () => {
    const block = db.doc('blocked_users/follow-block');
    for (const tuple of [{ blocker_id: owner.uid, blocked_id: follower.profile }, { blocker_id: follower.uid, blocked_id: owner.profile }]) {
      await block.set(tuple); assert.equal((await feed()).posts.length, 0); assert.equal((await state()).blocked, true);
      await assert.rejects(request(), { code: 'permission-denied' });
    }
    await decide('remove'); assert.equal((await db.collection('follows').get()).size, 0);
    await block.delete(); assert.equal((await feed()).posts.length, 0); assert.equal((await state()).state, 'none');
  });
  await check('cancellation makes a retained owner approval stale', async () => {
    const pending = await request(); await run(follower, 'unfollow', { relationshipId, revision: pending.revision });
    await assert.rejects(run(owner, 'approve', { relationshipId, revision: pending.revision }), { code: 'failed-precondition' });
    assert.equal((await state()).state, 'none'); assert.equal((await feed()).posts.length, 0);
  });
  await check('public automatic follows do not silently grant later private-account access', async () => {
    await db.doc(`profiles/${owner.profile}`).update({ is_private: false });
    assert.equal((await request()).state, 'following'); assert.equal((await proof.get()).data().approved_by_owner, false);
    await db.doc(`profiles/${owner.profile}`).update({ is_private: true });
    assert.equal((await state()).state, 'none'); assert.equal((await feed()).posts.length, 0);
    assert.equal((await request()).state, 'pending'); await decide('approve'); assert.equal((await feed()).posts.length, 1);
  });
  await check('unfollow revokes proof and cleans only this canonical projection', async () => {
    await db.doc('follows/foreign').set({ follower_id: other.profile, following_id: owner.profile });
    await run(follower, 'unfollow', { relationshipId, revision: (await state()).revision });
    assert.equal((await feed()).posts.length, 0); assert.equal((await db.collection('follows').get()).size, 1);
    await db.doc('follows/foreign').delete();
    await db.doc('follows/forged').set({ follower_id: follower.uid, following_id: owner.profile, status: 'approved' });
    assert.equal((await state()).state, 'none'); assert.equal((await feed()).posts.length, 0);
    await request(); assert.equal((await db.collection('follows').get()).size, 0);
  });
  await check('simultaneous approval and cancellation have exactly one valid revision winner', async () => {
    const revision = (await state()).revision;
    const outcomes = await Promise.allSettled([run(owner, 'approve', { relationshipId, revision }), run(follower, 'unfollow', { relationshipId, revision })]);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'failed-precondition');
    if ((await state()).state === 'following') await decide('remove');
  });
  await check('duplicate identities deny grants and owners can remove a deleted follower', async () => {
    await request(); await db.doc('profiles/duplicate').set({ user_id: follower.uid });
    await assert.rejects(decide('approve'), { code: 'failed-precondition' }); await db.doc('profiles/duplicate').delete();
    await decide('approve'); await db.doc(`profiles/${follower.profile}`).update({ is_deleted: true });
    const list = await run(owner, 'list', { view: 'followers' }); assert.equal(list.relationships[0].follower.username, '');
    await run(owner, 'remove', { relationshipId, revision: list.relationships[0].revision });
    await db.doc(`profiles/${follower.profile}`).update({ is_deleted: false }); assert.equal((await feed()).posts.length, 0);
  });
  await check('raw proof and count projections are client-write closed, including staff claims', async () => {
    for (const context of [env.unauthenticatedContext(), env.authenticatedContext(owner.uid), env.authenticatedContext(follower.uid), env.authenticatedContext(other.uid, { admin: true })]) {
      const database = context.firestore();
      await assertFails(getDoc(doc(database, proof.path))); await assertFails(getDocs(collection(database, '_follow_authority')));
      await assertFails(setDoc(doc(database, proof.path), { enabled: true }));
      await assertFails(setDoc(doc(database, 'follows/forged'), { follower_id: follower.profile, following_id: owner.profile }));
      await assertFails(deleteDoc(doc(database, 'follows/forged')));
    }
  });
  console.log(`Follow authority backend: ${checks} grouped checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
