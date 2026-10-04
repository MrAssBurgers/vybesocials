import assert from 'node:assert/strict';

// Admin SDK bypasses rules: refuse all non-demo projects and non-loopback hosts
// before importing anything that initializes Firebase. No credentials needed.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db } = await import('../functions/lib/_shared/admin.js');
const { reconcileChallenge, consumeChallengeReward, rewardAuthorityId } = await import('../functions/lib/_shared/challengeRewardAuthority.js');
const { changeBadgeGrant } = await import('../functions/lib/badgeAuthority.js');
let checks = 0;
const check = async (label, run) => { await run(); checks++; console.log(`PASS ${label}`); };
const actor = { authUid: 'reward-backend-auth', profileId: 'reward-backend-profile' };
let now = Date.now() + 1000;
const day = new Date(now).toISOString().slice(0, 10);
const definition = { type: 'daily', active_date: day, is_active: true, requirement_type: 'post', requirement_count: 1, reward_xp: 25, reward_badge_id: 'backend-earned' };
const receiptId = `${actor.authUid}_backend-daily`;
const grantRef = db.collection('_challenge_reward_authority').doc(rewardAuthorityId(actor.authUid, 'backend-daily'));
const levelRef = db.collection('user_levels').doc(actor.profileId);
try {
  const response = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(response.ok, 'Emulator reset succeeded');
  const batch = db.batch();
  batch.set(db.collection('profiles').doc(actor.profileId), { user_id: actor.authUid });
  batch.set(db.collection('user_auth_index').doc(actor.authUid), { profile_id: actor.profileId });
  batch.set(db.collection('badges').doc('backend-earned'), { name: 'Earned' });
  batch.set(db.collection('badges').doc('backend-staff'), { name: 'Staff test' });
  batch.set(db.collection('challenges').doc('backend-daily'), definition);
  batch.set(db.collection('battle_pass_tiers').doc('two'), { level: 2, xp_required: 100 });
  batch.set(levelRef, { user_id: actor.profileId, total_xp: 100, current_level: 2, created_at: 'keep', unclaimed_rewards: ['keep'] });
  batch.set(db.collection('challenge_rewards').doc(receiptId), { user_id: actor.authUid, challenge_id: 'backend-daily', xp_amount: 999999, badge_id: 'forged', is_claimed: false });
  await batch.commit();
  await check('forged receipt cannot mint XP without retained activity', async () => {
    await assert.rejects(consumeChallengeReward(db, actor, receiptId, now), { code: 'failed-precondition' });
    assert.equal((await levelRef.get()).data().total_xp, 100);
  });
  const sourceRef = db.collection('posts').doc('backend-proof');
  await sourceRef.set({ author_id: actor.profileId, created_at: new Date(now).toISOString(), type: 'post' });
  // A cold emulator can take seconds to initialize. Derive the fixture window
  // after commit so a slow setup never makes this real source appear future-dated.
  const sourceCreated = (await sourceRef.get()).createTime.toMillis();
  now = Math.max(Date.now(), sourceCreated) + 1;
  await sourceRef.update({ created_at: new Date(sourceCreated).toISOString() });
  await db.collection('challenges').doc('backend-daily').update({ active_date: new Date(sourceCreated).toISOString().slice(0, 10) });
  await check('real Firestore createTime and concurrent issuance create one proof', async () => {
    const results = await Promise.all([reconcileChallenge(db, actor, 'backend-daily', now), reconcileChallenge(db, actor, 'backend-daily', now)]);
    assert.equal(results.filter(result => result.newly_completed).length, 1);
    assert.equal((await grantRef.get()).data().xp_amount, 25);
  });
  await check('concurrent claim transaction credits once, preserves prior XP and issues badge', async () => {
    const results = await Promise.all([consumeChallengeReward(db, actor, receiptId, now), consumeChallengeReward(db, actor, receiptId, now)]);
    assert.equal(results.reduce((sum, result) => sum + result.xp_gained, 0), 25);
    const level = (await levelRef.get()).data();
    assert.equal(level.total_xp, 125); assert.equal(level.created_at, 'keep'); assert.deepEqual(level.unclaimed_rewards, ['keep']);
    assert.equal((await db.collection('user_badges').doc(`${actor.authUid}_backend-earned`).get()).exists, true);
  });
  await check('replay survives deleted activity and rotated definition without another credit', async () => {
    await db.collection('posts').doc('backend-proof').delete(); await db.collection('challenges').doc('backend-daily').delete();
    assert.equal((await consumeChallengeReward(db, actor, receiptId, now)).xp_gained, 0);
  });
  await check('caller cannot consume another account’s receipt', async () => {
    await assert.rejects(consumeChallengeReward(db, { authUid: 'other', profileId: 'other' }, receiptId, now), { code: 'permission-denied' });
  });
  const badgeInput = { p_user_id: actor.profileId, p_badge_id: 'backend-staff' };
  await check('concurrent staff awards share one canonical grant', async () => {
    const results = await Promise.all([changeBadgeGrant(db, 'staff', badgeInput, 'award', now), changeBadgeGrant(db, 'staff', badgeInput, 'award', now)]);
    assert.equal(results.filter(result => !result.already_awarded).length, 1);
  });
  await check('badge revoke is idempotent across UID/profile aliases', async () => {
    assert.equal((await changeBadgeGrant(db, 'staff', badgeInput, 'revoke', now)).removed, 1);
    assert.equal((await changeBadgeGrant(db, 'staff', { ...badgeInput, p_user_id: actor.authUid }, 'revoke', now)).removed, 0);
  });
  await check('a newly created source cannot be retimestamped into a historical challenge', async () => {
    const yesterday = new Date(now - 86400000).toISOString().slice(0, 10);
    await db.collection('challenges').doc('backend-old').set({ ...definition, active_date: yesterday });
    await db.collection('posts').doc('backend-fake-old').set({ author_id: actor.profileId, created_at: `${yesterday}T12:00:00.000Z`, type: 'post' });
    assert.equal((await reconcileChallenge(db, actor, 'backend-old', now)).is_completed, false);
  });
  console.log(`Reward backend emulator: ${checks} checks passed`);
} finally {
  await db.terminate();
}
