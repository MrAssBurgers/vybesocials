import assert from 'node:assert/strict';

// This fixture must never initialize against a real Firebase project.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId });
const { db } = await import('../functions/lib/_shared/admin.js');
const { resolveProfileVisibility } = await import('../functions/lib/friendProfile.js');
const { closeFriendAuthorityId, PROFILE_VISIBILITY_DEFAULTS } = await import('../functions/lib/_shared/profileAudienceAuthority.js');
const viewer = { uid: 'audience-qa-viewer', profile: 'audience-qa-viewer-profile' };
const owner = { uid: 'audience-qa-owner', profile: 'audience-qa-owner-profile' };
const proof = db.doc(`_close_friend_authority/${closeFriendAuthorityId(owner.uid, viewer.uid)}`);
const preference = db.doc(`profile_visibility/${owner.profile}`);
const relationship = db.doc('friend_requests/audience-qa-relationship');
const invoke = (identity = viewer, patch = {}, token = {}) => resolveProfileVisibility.run({ auth: { uid: identity.uid, token }, data: {
  expectedOwnerUid: identity.uid, expectedProfileId: identity.profile, target_id: owner.profile, ...patch,
} });
const setProof = (patch = {}) => proof.set({ version: 1, owner_uid: owner.uid, owner_profile_id: owner.profile,
  friend_uid: viewer.uid, friend_profile_id: viewer.profile, enabled: true, ...patch });
let checks = 0;
const check = async (label, action) => { await action(); checks++; console.log(`PASS ${label}`); };
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok);
  for (const identity of [viewer, owner]) {
    await db.doc(`profiles/${identity.profile}`).set({ user_id: identity.uid, username: identity.uid });
    await db.doc(`user_auth_index/${identity.uid}`).set({ profile_id: identity.profile });
  }
  await check('guests and wrong expected owners fail before rate or profile work', async () => {
    await assert.rejects(resolveProfileVisibility.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(invoke(viewer, { expectedOwnerUid: owner.uid }), { code: 'failed-precondition' });
    assert.equal((await db.collection('_rate_limits').get()).size, 0);
  });
  await check('canonical response identities and existing defaults preserve public and private distinction', async () => {
    const result = await invoke(); assert.equal(result.ok, true);
    assert.equal(result.ownerUid, viewer.uid); assert.equal(result.viewerProfileId, viewer.profile); assert.equal(result.targetProfileId, owner.profile);
    assert.deepEqual(result.settings, PROFILE_VISIBILITY_DEFAULTS); assert.equal(result.fields.posts, true); assert.equal(result.fields.bio, false);
    assert.equal(result.isFriend, false); assert.equal(result.isSelf, false);
  });
  await check('deterministic document names do not authorize unrelated friendship tuples', async () => {
    await db.doc(`friend_requests/${viewer.profile}_${owner.profile}`).set({ sender_id: 'foreign', receiver_id: 'other', status: 'accepted' });
    assert.equal((await invoke()).fields.bio, false);
  });
  await check('accepted alias friendships allow friends but not close-friends or owner-only sections', async () => {
    await relationship.set({ sender_id: owner.uid, receiver_id: viewer.profile, status: 'accepted' });
    await preference.set({ id: owner.profile, user_id: owner.profile, fields: { bio: 'friends', posts: 'close_friends', clips: 'only_me' } });
    const result = await invoke(); assert.equal(result.fields.bio, true); assert.equal(result.fields.posts, false); assert.equal(result.fields.clips, false);
  });
  await check('historical forged close-friend tuples never become authority', async () => {
    await db.doc('close_friends/legacy-forged').set({ user_id: owner.profile, friend_id: viewer.profile });
    assert.equal((await invoke()).fields.posts, false);
  });
  await check('fresh directional proof enables a section and revocation takes effect on the next call', async () => {
    await setProof(); assert.equal((await invoke()).fields.posts, true);
    await proof.update({ enabled: false }); assert.equal((await invoke()).fields.posts, false);
  });
  await check('stale profile tuples and malformed enabled flags cannot grant section access', async () => {
    for (const patch of [{ friend_profile_id: 'old-profile' }, { owner_profile_id: 'old-owner' }, { enabled: 'true' }, { owner_uid: viewer.uid }, { version: 2 }]) {
      await setProof(patch); assert.equal((await invoke()).fields.posts, false);
    }
  });
  await check('two-way UID/profile blocks override even public sections and staff claims', async () => {
    await setProof();
    for (const block of [{ blocker_id: viewer.uid, blocked_id: owner.profile }, { blocker_id: owner.uid, blocked_id: viewer.profile }]) {
      await db.doc('blocked_users/audience-block').set(block);
      const result = await invoke(viewer, {}, { admin: true }); assert.equal(result.isBlocked, true); assert.equal(result.isFriend, false);
      assert.ok(Object.values(result.fields).every(value => value === false));
    }
    await db.doc('blocked_users/audience-block').delete();
  });
  await check('removing friendship disables close-friend admission despite retained proof', async () => {
    await relationship.delete(); assert.equal((await invoke()).fields.posts, false);
    await relationship.set({ sender_id: viewer.uid, receiver_id: owner.uid, status: 'accepted' });
  });
  await check('owner access remains available for every recognized visibility level', async () => {
    for (const value of ['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private']) {
      await preference.set({ fields: Object.fromEntries(Object.keys(PROFILE_VISIBILITY_DEFAULTS).map(field => [field, value])) });
      const result = await invoke(owner); assert.equal(result.isSelf, true); assert.ok(Object.values(result.fields).every(Boolean));
    }
  });
  await check('unknown levels and malformed preferences deny without echoing arbitrary content', async () => {
    await preference.set({ fields: { bio: 'bad-setting', posts: true, arbitrary_role: 'public' } });
    let result = await invoke(); assert.equal(result.settings.bio, 'unavailable'); assert.equal(result.fields.bio, false); assert.equal(result.fields.posts, false);
    assert.equal(Object.hasOwn(result.fields, 'arbitrary_role'), false);
    for (const fields of [null, [], 'public']) {
      await preference.set({ fields }); result = await invoke(); assert.ok(Object.values(result.fields).every(value => value === false));
    }
    await preference.set({ user_id: 'wrong-owner', fields: { bio: 'public' } }); assert.equal((await invoke()).fields.bio, false);
  });
  await check('missing, deleted and noncanonical target identities never get default grants', async () => {
    await assert.rejects(invoke(viewer, { target_id: 'missing' }), { code: 'failed-precondition' });
    await assert.rejects(invoke(viewer, { target_id: owner.uid }), { code: 'failed-precondition' });
    await db.doc(`profiles/${owner.profile}`).update({ is_deleted: true });
    await assert.rejects(invoke(), { code: 'failed-precondition' }); await db.doc(`profiles/${owner.profile}`).update({ is_deleted: false });
  });
  await check('duplicate mappings and UID/profile collisions deny rather than borrow section authority', async () => {
    await db.doc('profiles/audience-duplicate').set({ user_id: viewer.uid });
    await assert.rejects(invoke(), { code: 'failed-precondition' }); await db.doc('profiles/audience-duplicate').delete();
    await db.doc('profiles/audience-collision').set({ user_id: owner.profile });
    await assert.rejects(invoke(), { code: 'failed-precondition' }); await db.doc('profiles/audience-collision').delete();
  });
  await check('current viewer index and explicit profile binding reject stale sessions', async () => {
    await assert.rejects(invoke(viewer, { expectedProfileId: 'old-viewer' }), { code: 'failed-precondition' });
    await db.doc(`user_auth_index/${viewer.uid}`).set({ profile_id: 'other' });
    await assert.rejects(invoke(), { code: 'failed-precondition' }); await db.doc(`user_auth_index/${viewer.uid}`).set({ profile_id: viewer.profile });
  });
  await check('profile settings changes are read afresh and no fixture call rewrites source settings', async () => {
    await preference.set({ fields: { bio: 'only_me' } }); assert.equal((await invoke()).fields.bio, false);
    await preference.set({ fields: { bio: 'public' } }); assert.equal((await invoke()).fields.bio, true);
    assert.deepEqual((await preference.get()).data(), { fields: { bio: 'public' } });
  });
  console.log(`Profile audience backend: ${checks} checks passed (actual emulator transactions; no provider calls).`);
} finally { await db.terminate(); }
