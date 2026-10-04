import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
// Every fixture operation must remain inside explicit disposable emulators.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const bucketName = `${projectId}.appspot.com`;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId, storageBucket: bucketName });
const { db } = await import('../functions/lib/_shared/admin.js');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { getStorage } = require('firebase-admin/storage');
const { publishStory, listVisibleStories, manageCloseFriends } = await import('../functions/lib/storyPublish.js');
const { publishStoryWithReceipt, storyRequestKey, STORY_LIFETIME_MS } = await import('../functions/lib/_shared/storyPublishAuthority.js');
const bucket = getStorage().bucket();
let checks = 0;
const check = async (label, action) => { await action(); checks++; console.log(`PASS ${label}`); };
const call = (uid, data) => publishStory.run({ auth: uid ? { uid, token: {} } : undefined, data });
const uid = 'story-qa-alice'; const profileId = 'story-qa-alice-profile';
const path = `stories/${uid}/photo.png`;
const url = `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${bucketName}/o/${encodeURIComponent(path)}?alt=media`;
const input = (patch = {}) => ({ expectedOwnerUid: uid, requestId: 'story-qa-draft-one', mediaUrl: url, mediaType: 'image', caption: 'Synthetic story', ...patch });
const key = (requestId = 'story-qa-draft-one', destination = 'my_story') => storyRequestKey(uid, requestId, destination);
const storyRef = (requestId) => db.doc(`stories/story_${key(requestId)}`);
const receiptRef = (requestId) => db.doc(`_story_publish_receipts/${key(requestId)}`);
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: 'story-alice' });
  await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  await bucket.file(path).save(Buffer.from('synthetic local image metadata fixture'), { metadata: { contentType: 'image/png' }, resumable: false });
  await check('guest and wrong expected owner fail before publication', async () => {
    await assert.rejects(call(null, input()), { code: 'unauthenticated' });
    await assert.rejects(call('story-qa-bob', input()), { code: 'failed-precondition' });
    assert.equal((await storyRef().get()).exists, false);
  });
  await check('actual upload metadata plus concurrent callable requests issue one story and receipt', async () => {
    const results = await Promise.all([call(uid, input()), call(uid, input()), call(uid, input())]);
    assert.equal(results.filter(row => row.created).length, 1); assert.equal(new Set(results.map(row => row.storyId)).size, 1);
    assert.equal((await db.collection('stories').get()).size, 1);
    const story = (await storyRef().get()).data(); const receipt = (await receiptRef().get()).data();
    assert.equal(story.author_id, profileId); assert.equal(receipt.owner_uid, uid); assert.equal(story.publish_receipt_id, key());
    assert.equal(Date.parse(story.expires_at) - Date.parse(story.created_at), STORY_LIFETIME_MS);
  });
  await check('changed payload cannot reuse a request identity', async () => {
    await assert.rejects(call(uid, input({ caption: 'Changed' })), { code: 'already-exists' });
    assert.equal((await storyRef().get()).data().caption, 'Synthetic story');
  });
  await check('committed deletion wins replay and missing storage cannot recreate a story', async () => {
    await storyRef().delete(); await bucket.file(path).delete();
    const replay = await call(uid, input()); assert.equal(replay.status, 'deleted'); assert.equal(replay.story, null);
    assert.equal((await storyRef().get()).exists, false); assert.equal((await receiptRef().get()).exists, true);
  });
  await check('expiry is permanent for the original request even after document cleanup', async () => {
    await bucket.file(path).save(Buffer.from('synthetic'), { metadata: { contentType: 'image/png' }, resumable: false });
    const expiryInput = input({ requestId: 'expiry' }); const started = Date.now();
    await publishStoryWithReceipt(db, uid, expiryInput, undefined, started);
    await storyRef('expiry').delete();
    const replay = await publishStoryWithReceipt(db, uid, expiryInput, undefined, started + STORY_LIFETIME_MS);
    assert.equal(replay.status, 'expired'); assert.equal((await storyRef('expiry').get()).exists, false);
  });
  await check('foreign account media and arbitrary remote media are rejected', async () => {
    const foreign = url.replace(encodeURIComponent(path), encodeURIComponent('stories/story-qa-bob/photo.png'));
    await assert.rejects(call(uid, input({ requestId: 'foreign-media', mediaUrl: foreign })), { code: 'permission-denied' });
    await assert.rejects(call(uid, input({ requestId: 'remote-media', mediaUrl: 'https://example.com/photo.png' })), { code: 'invalid-argument' });
    assert.equal((await receiptRef('foreign-media').get()).exists, false);
  });
  await check('missing uploads and wrong metadata MIME cannot publish or leave receipts', async () => {
    await assert.rejects(call(uid, input({ requestId: 'missing', mediaUrl: url.replace('photo.png', 'missing.png') })), { code: 'failed-precondition' });
    await assert.rejects(call(uid, input({ requestId: 'wrong-mime', mediaType: 'video' })), { code: 'invalid-argument' });
    assert.equal((await receiptRef('wrong-mime').get()).exists, false);
  });
  await check('unique live author and expected profile are enforced', async () => {
    await assert.rejects(call(uid, input({ requestId: 'wrong-profile', authorId: 'story-qa-bob-profile' })), { code: 'failed-precondition' });
    await db.doc('profiles/story-qa-duplicate').set({ user_id: uid });
    await assert.rejects(call(uid, input({ requestId: 'ambiguous' })), { code: 'failed-precondition' }); await db.doc('profiles/story-qa-duplicate').delete();
  });
  await check('question and close-friends audience are preserved in the server schema', async () => {
    const value = await call(uid, input({ requestId: 'poll', isCloseFriendsOnly: true, aspectRatio: 0.75, pollData: { type: 'question', question: 'Synthetic question?', options: [] } }));
    assert.equal(value.story.is_close_friends_only, true); assert.deepEqual(value.story.poll_data, { type: 'question', question: 'Synthetic question?', options: [] });
  });
  await check('preallocated deterministic story ID fails without replacing existing data', async () => {
    await storyRef('squatted').set({ author_id: 'other', caption: 'Retained' });
    await assert.rejects(call(uid, input({ requestId: 'squatted' })), { code: 'failed-precondition' });
    assert.equal((await storyRef('squatted').get()).data().caption, 'Retained'); assert.equal((await receiptRef('squatted').get()).exists, false);
  });
  await check('quota cap blocks a fresh request but permits the existing immutable receipt', async () => {
    const quota = (await db.collection('_story_publish_limits').where('owner_uid', '==', uid).get()).docs[0];
    await quota.ref.update({ count: 50 });
    await assert.rejects(call(uid, input({ requestId: 'over-quota' })), { code: 'resource-exhausted' });
    assert.equal((await call(uid, input())).status, 'deleted');
  });
  const bob = 'story-qa-bob'; const bobProfile = 'story-qa-bob-profile';
  await db.doc(`profiles/${bobProfile}`).set({ user_id: bob, username: 'Bob' });
  await db.doc(`user_auth_index/${bob}`).set({ profile_id: bobProfile });
  const list = (viewer = bob, patch = {}) => listVisibleStories.run({ auth: { uid: viewer, token: {} }, data: { expectedOwnerUid: viewer, expectedProfileId: viewer === uid ? profileId : bobProfile, ...patch } });
  const manage = (action, patch = {}) => manageCloseFriends.run({ auth: { uid, token: {} }, data: { expectedOwnerUid: uid, expectedProfileId: profileId, action, ...(action === 'list' ? {} : { friendId: bobProfile }), ...patch } });
  const live = { author_id: profileId, media_url: url, media_type: 'image', is_close_friends_only: false, created_at: new Date(Date.now() - 5000).toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString() };
  await db.doc('stories/ordinary').set(live); await db.doc('stories/close').set({ ...live, is_close_friends_only: true });
  await check('strangers and staff cannot use known IDs or author lookup to bypass current friendship', async () => {
    assert.deepEqual((await list(bob, { storyIds: ['ordinary', 'close'] })).stories, []);
    assert.deepEqual((await list(bob, { authorId: profileId })).stories, []);
    const staff = await listVisibleStories.run({ auth: { uid: bob, token: { admin: true } }, data: { expectedOwnerUid: bob, expectedProfileId: bobProfile } });
    assert.deepEqual(staff.stories, []);
  });
  await check('accepted friend sees ordinary stories while author retains access to close stories', async () => {
    await db.doc('friend_requests/accepted').set({ sender_id: profileId, receiver_id: bobProfile, status: 'accepted' });
    assert.deepEqual((await list(bob, { storyIds: ['ordinary', 'close'] })).stories.map(row => row.id), ['ordinary']);
    assert.equal((await list(uid, { storyIds: ['close'] })).stories[0].id, 'close');
  });
  await check('current author grant authorizes close friend and removal is immediately reflected', async () => {
    await db.doc('close_friends/grant').set({ user_id: uid, friend_id: bobProfile });
    assert.deepEqual((await list(bob, { storyIds: ['close'] })).stories, []);
    const legacyList = await manage('list'); assert.equal(legacyList.legacyReview, true); assert.deepEqual(legacyList.friends, []); assert.equal(legacyList.candidates[0].id, bobProfile);
    await manage('add');
    assert.equal((await list(bob, { storyIds: ['close'] })).stories[0].id, 'close');
    await manage('remove'); assert.deepEqual((await list(bob, { storyIds: ['close'] })).stories, []);
    const proofs = await db.collection('_close_friend_authority').where('owner_uid', '==', uid).get(); assert.equal(proofs.size, 1); assert.equal(proofs.docs[0].data().enabled, false);
    await db.doc('close_friends/reversed').set({ user_id: bobProfile, friend_id: profileId }); assert.deepEqual((await list(bob, { storyIds: ['close'] })).stories, []);
  });
  await check('both-direction account alias blocks override retained friendship and close grant', async () => {
    await manage('add');
    for (const block of [{ blocker_id: uid, blocked_id: bobProfile }, { blocker_id: bob, blocked_id: profileId }]) {
      await db.doc('blocked_users/block').set(block);
      assert.deepEqual((await list(bob, { storyIds: ['ordinary', 'close'] })).stories, []);
      assert.deepEqual((await list(bob, { authorId: uid })).stories, []);
      await assert.rejects(manage('add'), { code: 'permission-denied' }); assert.deepEqual((await manage('list')).candidates, []);
    }
    await db.doc('blocked_users/block').delete();
  });
  await check('expired and deleted direct story selections never reveal retained media', async () => {
    await db.doc('stories/expired').set({ ...live, expires_at: new Date(Date.now() - 1000).toISOString() });
    await db.doc('stories/deleted').set({ ...live, is_deleted: true });
    assert.deepEqual((await list(bob, { storyIds: ['expired', 'deleted', 'missing'] })).stories, []);
  });
  await check('current viewer profile mapping and owner guard survive an alias replacement attempt', async () => {
    await assert.rejects(list(bob, { expectedOwnerUid: uid }), { code: 'failed-precondition' });
    await assert.rejects(list(bob, { expectedProfileId: profileId }), { code: 'failed-precondition' });
    await db.doc('profiles/borrowed').set({ user_id: bobProfile });
    await assert.rejects(list(), { code: 'failed-precondition' }); await db.doc('profiles/borrowed').delete();
    await db.doc(`user_auth_index/${bob}`).set({ profile_id: 'changed' });
    await assert.rejects(list(), { code: 'failed-precondition' }); await db.doc(`user_auth_index/${bob}`).set({ profile_id: bobProfile });
    assert.equal((await list(bob, { storyIds: ['ordinary'] })).stories[0].id, 'ordinary');
  });
  await check('legacy gs media resolves only an existing download token after viewer admission', async () => {
    await bucket.file(path).setMetadata({ metadata: { firebaseStorageDownloadTokens: 'synthetic-story-token' } });
    await db.doc('stories/legacy-gs').set({ ...live, media_url: `gs://stories/${uid}/photo.png` });
    const row = (await list(bob, { storyIds: ['legacy-gs'] })).stories[0];
    assert.ok(row); assert.match(row.media_url, /alt=media&token=synthetic-story-token/);
    assert.equal((await fetch(row.media_url)).status, 200);
  });
  await check('profile Only me setting denies every nonowner story lookup while retaining author access', async () => {
    await db.doc(`profile_visibility/${profileId}`).set({ fields: { stories: 'only_me' } });
    assert.deepEqual((await list(bob, { authorId: profileId })).stories, []);
    assert.deepEqual((await list(bob, { storyIds: ['ordinary', 'close'] })).stories, []);
    assert.equal((await list(uid, { storyIds: ['ordinary'] })).stories[0].id, 'ordinary');
    await db.doc(`profile_visibility/${profileId}`).delete();
  });
  await check('unfriending revokes ordinary and close direct selections without deleting retained stories', async () => {
    await db.doc('friend_requests/accepted').delete(); assert.deepEqual((await list(bob, { storyIds: ['ordinary', 'close'] })).stories, []);
    assert.equal((await db.doc('stories/close').get()).exists, true);
    await assert.rejects(manage('add'), { code: 'permission-denied' });
    await manage('remove'); assert.deepEqual((await manage('list')).friends, []);
  });
  await check('management rejects owner/profile substitution and cannot grant from a legacy tuple', async () => {
    await assert.rejects(manage('add', { expectedOwnerUid: bob }), { code: 'failed-precondition' });
    await assert.rejects(manage('add', { expectedProfileId: bobProfile }), { code: 'failed-precondition' });
    await assert.rejects(manage('add', { friendId: uid }), { code: 'failed-precondition' });
    assert.deepEqual((await list(bob, { storyIds: ['close'] })).stories, []);
  });
  await check('retained proof remains visible and revocable after target deletion', async () => {
    await db.doc('friend_requests/accepted').set({ sender_id: profileId, receiver_id: bobProfile, status: 'accepted' });
    await manage('add'); await db.doc(`profiles/${bobProfile}`).delete();
    const result = await manage('list'); assert.equal(result.friends[0].friend.display_name, 'Unavailable account');
    await manage('remove'); assert.deepEqual((await manage('list')).friends, []);
  });
  console.log(`Story publication backend: ${checks} checks passed (actual emulator Firestore transactions and Storage metadata; no provider calls).`);
} finally {
  await bucket.file(path).delete().catch(() => undefined);
  await db.terminate();
}
