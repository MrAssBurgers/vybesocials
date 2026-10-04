import assert from 'node:assert/strict';
// Refuse production before any Firebase module initializes. Every identity and
// purchase below is synthetic, and Admin writes are only emulator fixtures.
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const { db } = await import('../functions/lib/_shared/admin.js');
const { tokenMarketplace } = await import('../functions/lib/tokenMarketplace.js');
const { purchaseTokenItem, activateTokenBoost, tokenMarketplaceState, equipTokenItem, tokenTupleId } = await import('../functions/lib/_shared/tokenMarketplaceAuthority.js');
const { claimTokenCredit } = await import('../functions/lib/_shared/tokenCreditAuthority.js');
const { reconcileChallenge, consumeChallengeReward, rewardAuthorityId } = await import('../functions/lib/_shared/challengeRewardAuthority.js');
const { changeBadgeGrant, badgeAuthorityId } = await import('../functions/lib/badgeAuthority.js');
let checks = 0;
const check = async (label, run) => { await run(); checks++; console.log(`PASS ${label}`); };
const call = (uid, data) => tokenMarketplace.run({ auth: uid ? { uid, token: {} } : undefined, data });
const walletRef = actor => db.doc(`token_wallets/${actor.authUid}`);
const inventoryRef = (actor, itemId) => db.doc(`token_entitlements/${tokenTupleId(actor.authUid, itemId)}`);
const boostRef = (actor, type) => db.doc(`token_boosts/${tokenTupleId(actor.authUid, type)}`);
const wallet = async (actor, balance) => walletRef(actor).set({ schema_version: 1, id: actor.authUid, user_id: actor.authUid, balance, lifetime_earned: balance, lifetime_spent: 0, updated_at: new Date().toISOString() });
const actor = async name => {
  const value = { authUid: `token-qa-${name}`, profileId: `token-qa-profile-${name}` };
  await db.doc(`profiles/${value.profileId}`).set({ user_id: value.authUid, username: name });
  await db.doc(`user_auth_index/${value.authUid}`).set({ profile_id: value.profileId });
  return value;
};
const purchase = (owner, itemId, requestId, expectedCost) => purchaseTokenItem(db, owner, { itemId, requestId, expectedCost });
const post = async (id, owner, extra = {}) => { const ref = db.doc(`posts/${id}`); await ref.set({ author_id: owner.profileId, caption: 'Synthetic retained post', type: 'post', created_at: new Date().toISOString(), ...extra }); return ref; };
const sourceNow = async ref => Math.max(Date.now(), (await ref.get()).createTime.toMillis());
try {
  const reset = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(reset.ok, 'Demo reset succeeded');
  const alice = await actor('alice'); const bob = await actor('bob');
  await check('callable rejects guests and ignores caller-supplied wallet owner', async () => {
    await assert.rejects(call(null, { action: 'state' }), { code: 'unauthenticated' });
    await wallet(bob, 999);
    const state = await call(alice.authUid, { action: 'state', user_id: bob.authUid, profileId: bob.profileId });
    assert.equal(state.wallet.user_id, alice.authUid); assert.equal(state.wallet.balance, 0);
  });
  await check('historical balance, forged purchases and boosts are retained but not trusted', async () => {
    await db.doc('vybe_tokens/old-wallet').set({ user_id: alice.profileId, balance: 999999 });
    await db.doc('marketplace_purchases/old-purchase').set({ user_id: alice.profileId, item_id: 'theme_neon' });
    await db.doc('user_active_boosts/old-boost').set({ user_id: alice.authUid, boost_type: 'tokens_2x', expires_at: null, consumed: false });
    const state = await tokenMarketplaceState(db, alice);
    assert.equal(state.legacy_review, true); assert.equal(state.wallet.balance, 0); assert.deepEqual(state.inventory, []); assert.deepEqual(state.boosts, []);
    await assert.rejects(purchase(alice, 'theme_neon', 'no-legacy-money', 200), { code: 'failed-precondition' });
    assert.equal((await db.doc('vybe_tokens/old-wallet').get()).data().balance, 999999);
  });
  await check('server catalog rejects forged price and unfulfilled offers without writes', async () => {
    await wallet(alice, 500);
    await assert.rejects(purchase(alice, 'theme_neon', 'forged-price', 1), { code: 'failed-precondition' });
    for (const [item, cost] of [['streak_shield', 60], ['visibility_boost', 90], ['roulette_pack', 50]]) await assert.rejects(purchase(alice, item, `unsupported-${item}`, cost), { code: 'failed-precondition' });
    assert.equal((await walletRef(alice).get()).data().balance, 500);
  });
  await check('simultaneous same-request purchase charges once and safely replays', async () => {
    const results = await Promise.all([purchase(alice, 'theme_neon', 'same-request', 200), purchase(alice, 'theme_neon', 'same-request', 200)]);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].balance, 300);
    assert.equal((await walletRef(alice).get()).data().balance, 300);
    assert.equal((await inventoryRef(alice, 'theme_neon').get()).data().quantity, 1);
    assert.deepEqual(await purchase(alice, 'theme_neon', 'same-request', 200), results[0]);
  });
  await check('receipt fingerprint and permanent ownership prevent double debit', async () => {
    await assert.rejects(purchase(alice, 'theme_ocean', 'same-request', 200), { code: 'already-exists' });
    await assert.rejects(purchase(alice, 'theme_neon', 'another-request', 200), { code: 'already-exists' });
    assert.equal((await walletRef(alice).get()).data().balance, 300);
  });
  await check('concurrent purchases cannot overspend one wallet', async () => {
    const concurrent = await actor('concurrent'); await wallet(concurrent, 300);
    const results = await Promise.allSettled([purchase(concurrent, 'theme_neon', 'neon', 200), purchase(concurrent, 'theme_ocean', 'ocean', 200)]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal((await walletRef(concurrent).get()).data().balance, 100);
    assert.equal((await db.collection('token_events').where('user_id', '==', concurrent.authUid).get()).size, 1);
  });
  await check('insufficient funds and squatted inventory roll back the entire purchase', async () => {
    const rollback = await actor('rollback'); await wallet(rollback, 100);
    await assert.rejects(purchase(rollback, 'avatar_frame_fire', 'cannot-buy', 400), { code: 'failed-precondition' });
    assert.equal((await inventoryRef(rollback, 'avatar_frame_fire').get()).exists, false);
    await wallet(rollback, 500);
    await inventoryRef(rollback, 'theme_neon').set({ schema_version: 1, user_id: bob.authUid, item_id: 'theme_neon', kind: 'permanent', quantity: 1, purchased_at: new Date().toISOString() });
    await assert.rejects(purchase(rollback, 'theme_neon', 'collision', 200), { code: 'failed-precondition' });
    assert.equal((await walletRef(rollback).get()).data().balance, 500);
    assert.equal((await db.collection('token_events').where('user_id', '==', rollback.authUid).get()).size, 0);
  });
  await check('inventory supports repeat purchases and exactly-once boost activation', async () => {
    await purchase(alice, 'token_boost_2x', 'boost-one', 100); await purchase(alice, 'token_boost_2x', 'boost-two', 100);
    assert.equal((await inventoryRef(alice, 'token_boost_2x').get()).data().quantity, 2);
    const input = { itemId: 'token_boost_2x', requestId: 'activate-once' };
    const results = await Promise.all([activateTokenBoost(db, alice, input), activateTokenBoost(db, alice, input)]);
    assert.deepEqual(results[0], results[1]); assert.equal((await inventoryRef(alice, 'token_boost_2x').get()).data().quantity, 1);
    await assert.rejects(activateTokenBoost(db, alice, { ...input, requestId: 'activate-again' }), { code: 'failed-precondition' });
    assert.equal((await inventoryRef(alice, 'token_boost_2x').get()).data().quantity, 1);
    assert.equal(Date.parse(results[0].boost.expires_at) - Date.parse(results[0].boost.activated_at), 3600000);
  });
  await check('expired activation replay cannot consume another item or restart a timer', async () => {
    const first = await activateTokenBoost(db, alice, { itemId: 'token_boost_2x', requestId: 'activate-once' });
    const later = Date.parse(first.boost.expires_at) + 1;
    const replay = await activateTokenBoost(db, alice, { itemId: 'token_boost_2x', requestId: 'activate-once' }, later);
    assert.deepEqual(replay, first); assert.equal((await inventoryRef(alice, 'token_boost_2x').get()).data().quantity, 1);
  });
  await check('paid cosmetics require verified entitlement and update the actual profile', async () => {
    await assert.rejects(equipTokenItem(db, bob, { type: 'profile_theme', value: 'theme_neon' }), { code: 'permission-denied' });
    await equipTokenItem(db, alice, { type: 'profile_theme', value: 'theme_neon' });
    assert.equal((await db.doc(`profiles/${alice.profileId}`).get()).data().equipped_profile_theme, 'theme_neon');
    await equipTokenItem(db, alice, { type: 'profile_theme', value: null });
    assert.equal((await db.doc(`profiles/${alice.profileId}`).get()).data().equipped_profile_theme, null);
  });
  await check('free tier equip survives while forged historical XP cannot unlock higher tiers', async () => {
    await db.doc('battle_pass_tiers/free').set({ level: 1, xp_required: 0, reward_type: 'title', reward_name: 'Starter', is_premium: false });
    await db.doc('battle_pass_tiers/earned').set({ level: 2, xp_required: 100, reward_type: 'title', reward_name: 'Verified', is_premium: false });
    await db.doc(`user_levels/${alice.profileId}`).set({ user_id: alice.authUid, total_xp: 999999, current_level: 99, verified_total_xp: 999999, verified_xp_version: 1 });
    await equipTokenItem(db, alice, { type: 'title', value: 'Starter' });
    await assert.rejects(equipTokenItem(db, alice, { type: 'title', value: 'Verified' }), { code: 'failed-precondition' });
  });
  await check('legacy badge appearance cannot equip; verified staff issue and revoke work', async () => {
    await db.doc('badges/special').set({ name: 'Synthetic badge' });
    await db.doc('user_badges/old-badge').set({ user_id: alice.authUid, badge_id: 'special', awarded_by: 'forged-staff', grant_source: 'staff', expires_at: null });
    await assert.rejects(equipTokenItem(db, alice, { type: 'badge', value: 'special' }), { code: 'failed-precondition' });
    await changeBadgeGrant(db, 'synthetic-staff', { p_user_id: alice.profileId, p_badge_id: 'special' }, 'award');
    await equipTokenItem(db, alice, { type: 'badge', value: 'special' });
    await changeBadgeGrant(db, 'synthetic-staff', { p_user_id: alice.profileId, p_badge_id: 'special' }, 'revoke');
    assert.equal((await db.doc(`profiles/${alice.profileId}`).get()).data().equipped_badge_id, null);
    assert.equal((await db.doc(`_badge_grant_authority/${badgeAuthorityId(alice.authUid, 'special')}`).get()).data().active, false);
    await assert.rejects(equipTokenItem(db, alice, { type: 'badge', value: 'special' }), { code: 'failed-precondition' });
  });
  const earner = await actor('earner');
  await check('simultaneous login credits one server amount, ignoring caller amounts', async () => {
    const results = await Promise.all(Array.from({ length: 3 }, () => claimTokenCredit(db, earner, { type: 'daily_login', amount: 999999, referenceId: 'spoofed-day' })));
    assert.equal(results.reduce((sum, r) => sum + r.credited, 0), 3); assert.equal((await walletRef(earner).get()).data().balance, 3);
  });
  await check('unsupported client ad completion cannot authorize money', async () => {
    await assert.rejects(claimTokenCredit(db, earner, { type: 'rewarded_ad', referenceId: 'client-says-finished' }), { code: 'failed-precondition' });
    assert.equal((await walletRef(earner).get()).data().balance, 3);
  });
  await check('retained posts earn once even with simultaneous requests and later edits', async () => {
    const source = await post('token-source-post', earner); const now = await sourceNow(source);
    const results = await Promise.all([claimTokenCredit(db, earner, { type: 'post_created', referenceId: source.id }, now), claimTokenCredit(db, earner, { type: 'post_created', referenceId: source.id }, now)]);
    assert.equal(results.reduce((sum, r) => sum + r.credited, 0), 10);
    await source.update({ caption: 'Changed caption', created_at: '2099-01-01' });
    assert.equal((await claimTokenCredit(db, earner, { type: 'post_created', referenceId: source.id }, now)).credited, 0);
  });
  await check('foreign, conflicting, draft and empty activity are not rewarded', async () => {
    for (const [suffix, owner, extra, code] of [
      ['foreign', bob, {}, 'permission-denied'], ['conflict', earner, { user_id: bob.authUid }, 'permission-denied'],
      ['draft', earner, { status: 'draft' }, 'failed-precondition'], ['empty', earner, { caption: '', media_url: null }, 'failed-precondition'],
    ]) {
      const source = await post(`token-bad-${suffix}`, owner, extra);
      await assert.rejects(claimTokenCredit(db, earner, { type: 'post_created', referenceId: source.id }, await sourceNow(source)), { code });
    }
    assert.equal((await walletRef(earner).get()).data().balance, 13);
  });
  await check('server creation time defeats client backdating into a later day', async () => {
    const source = await post('token-old-source', earner); const created = (await source.get()).createTime.toMillis();
    const nextDay = Date.parse(`${new Date(created + 86400000).toISOString().slice(0, 10)}T12:00:00.000Z`);
    await source.update({ created_at: new Date(nextDay).toISOString() });
    await assert.rejects(claimTokenCredit(db, earner, { type: 'post_created', referenceId: source.id }, nextDay), { code: 'failed-precondition' });
  });
  await check('daily activity cap serializes concurrent different sources', async () => {
    const refs = await Promise.all(['cap-a', 'cap-b', 'cap-c'].map(id => post(id, earner)));
    const now = Math.max(...await Promise.all(refs.map(sourceNow)));
    const results = await Promise.allSettled(refs.map(ref => claimTokenCredit(db, earner, { type: 'post_created', referenceId: ref.id }, now)));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
    assert.equal((await walletRef(earner).get()).data().balance, 33);
  });
  await check('comment needs its retained owner and a different live target', async () => {
    const target = await post('comment-target', bob);
    const source = db.doc('comments/token-comment'); await source.set({ user_id: earner.authUid, post_id: target.id, content: 'Synthetic comment' });
    assert.equal((await claimTokenCredit(db, earner, { type: 'comment_added', referenceId: source.id }, await sourceNow(source))).credited, 2);
    const own = db.doc('comments/token-self-comment'); await own.set({ user_id: earner.authUid, post_id: 'token-source-post', content: 'My own post' });
    await assert.rejects(claimTokenCredit(db, earner, { type: 'comment_added', referenceId: own.id }, await sourceNow(own)), { code: 'failed-precondition' });
  });
  await check('protected active boost doubles a real credit; expiry ends the multiplier', async () => {
    const source = await post('alice-boosted-post', alice); const now = await sourceNow(source);
    assert.equal((await claimTokenCredit(db, alice, { type: 'post_created', referenceId: source.id }, now)).credited, 20);
    const expired = await actor('expired');
    const end = new Date(now - 1).toISOString();
    await boostRef(expired, 'tokens_2x').set({ schema_version: 1, id: tokenTupleId(expired.authUid, 'tokens_2x'), user_id: expired.authUid, boost_type: 'tokens_2x', source_item_id: 'token_boost_2x', consumed: false, uses_remaining: null, activated_at: new Date(now - 3600001).toISOString(), expires_at: end });
    assert.equal((await claimTokenCredit(db, expired, { type: 'daily_login' }, now)).credited, 3);
  });
  await check('author-only comment schema earns without accepting conflicting ownership', async () => {
    const source = db.doc('comments/author-only-credit');
    await source.set({ author_id: earner.profileId, post_id: 'comment-target', content: 'Legacy author shape' });
    assert.equal((await claimTokenCredit(db, earner, { type: 'comment_added', referenceId: source.id }, await sourceNow(source))).credited, 2);
    const conflict = db.doc('comments/author-conflict-credit');
    await conflict.set({ author_id: earner.profileId, user_id: bob.authUid, post_id: 'comment-target', content: 'Conflicting owner' });
    await assert.rejects(claimTokenCredit(db, earner, { type: 'comment_added', referenceId: conflict.id }, await sourceNow(conflict)), { code: 'permission-denied' });
  });
  await check('claimed challenge grants boosted XP and one token credit from its protected receipt', async () => {
    const hero = await actor('challenge'); await wallet(hero, 100); await purchase(hero, 'xp_boost_2x', 'xp-purchase', 75);
    await activateTokenBoost(db, hero, { itemId: 'xp_boost_2x', requestId: 'xp-activate' });
    const source = await post('challenge-source', hero); const now = await sourceNow(source);
    await db.doc('challenges/token-challenge').set({ type: 'daily', is_active: true, active_date: new Date(now).toISOString().slice(0, 10), requirement_type: 'post', requirement_count: 1, reward_xp: 50, reward_badge_id: null });
    await reconcileChallenge(db, hero, 'token-challenge', now);
    const result = await consumeChallengeReward(db, hero, `${hero.authUid}_token-challenge`, now);
    assert.equal(result.xp_gained, 100); assert.equal(result.challenge_id, 'token-challenge');
    assert.equal((await db.doc(`_verified_xp_authority/${hero.authUid}`).get()).data().verified_total_xp, 100);
    const replay = await consumeChallengeReward(db, hero, `${hero.authUid}_token-challenge`, now); assert.equal(replay.xp_gained, 0);
    assert.equal((await claimTokenCredit(db, hero, { type: 'challenge_completed', referenceId: 'token-challenge' }, now)).credited, 25);
    assert.equal((await claimTokenCredit(db, hero, { type: 'challenge_completed', referenceId: 'token-challenge' }, now)).credited, 0);
    await equipTokenItem(db, hero, { type: 'title', value: 'Verified' });
    assert.equal((await db.doc(`profiles/${hero.profileId}`).get()).data().equipped_title, 'Verified');
    assert.equal((await db.doc(`_challenge_reward_authority/${rewardAuthorityId(hero.authUid, 'token-challenge')}`).get()).data().xp_multiplier, 2);
  });
  await check('legacy claimed challenge and malformed wallet cannot mint new verified currency', async () => {
    await db.doc('challenge_rewards/forged-claimed').set({ user_id: bob.authUid, challenge_id: 'forged-claimed', is_claimed: true, xp_amount: 25 });
    await assert.rejects(claimTokenCredit(db, bob, { type: 'challenge_completed', referenceId: 'forged-claimed' }), { code: 'failed-precondition' });
    await walletRef(bob).update({ balance: 999999 });
    await assert.rejects(claimTokenCredit(db, bob, { type: 'daily_login' }), { code: 'failed-precondition' });
  });
  await check('claiming a challenge cannot recreate a staff-revoked badge', async () => {
    const player = await actor('revoked-challenge');
    await changeBadgeGrant(db, 'synthetic-staff', { p_user_id: player.profileId, p_badge_id: 'special' }, 'award');
    await changeBadgeGrant(db, 'synthetic-staff', { p_user_id: player.profileId, p_badge_id: 'special' }, 'revoke');
    const source = await post('revoked-badge-source', player); const now = await sourceNow(source);
    await db.doc('challenges/revoked-badge-challenge').set({ type: 'daily', is_active: true, active_date: new Date(now).toISOString().slice(0, 10), requirement_type: 'post', requirement_count: 1, reward_xp: 50, reward_badge_id: 'special' });
    await reconcileChallenge(db, player, 'revoked-badge-challenge', now);
    const receipt = `${player.authUid}_revoked-badge-challenge`;
    const result = await consumeChallengeReward(db, player, receipt, now);
    assert.equal(result.xp_gained, 50); assert.equal(result.badge_suppressed, true); assert.equal(result.awarded_badge_id, null);
    assert.equal((await db.doc(`user_badges/${player.authUid}_special`).get()).exists, false);
    assert.equal((await db.doc(`challenge_rewards/${receipt}`).get()).data().badge_id, null);
    assert.equal((await consumeChallengeReward(db, player, receipt, now)).xp_gained, 0);
  });
  console.log(`Token marketplace backend emulator: ${checks} checks passed (real Firestore transactions, no provider stubs)`);
} finally { await db.terminate(); }
