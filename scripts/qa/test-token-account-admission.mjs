import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
assert.equal(process.versions.node.split('.')[0], '22');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-token-admission');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9200');
const { db, auth } = await import('../../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../../functions/lib/_shared/accountProfileAuthority.js');
const { currentTokenAccount, assertTokenAccountCurrent } = await import('../../functions/lib/_shared/tokenAccountAdmission.js');
const { resolveTokenActor, tokenTupleId } = await import('../../functions/lib/_shared/tokenMarketplaceAuthority.js');
const { claimTokenCredit } = await import('../../functions/lib/_shared/tokenCreditAuthority.js');
const results = [];
async function exchange(uid) {
  const token = await auth.createCustomToken(uid), r = await fetch('http://127.0.0.1:9200/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-local-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
  assert.equal(r.status, 200); return (await r.json()).idToken;
}
async function fixture() {
  const uid = 'token-admission-' + randomUUID(), user = await auth.createUser({ uid });
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: Date.parse(user.metadata.creationTime), requestId: randomUUID() });
  return { uid, token: await exchange(uid) };
}
async function call(f, data, scenario, name = 'tokenMarketplace') {
  assert.ok(['tokenMarketplace', 'syncMyChallengeProgress', 'claimChallengeReward'].includes(name));
  const r = await fetch('http://127.0.0.1:8358/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(f ? { Authorization: 'Bearer ' + f.token, 'x-qa-uid': f.uid } : {}), ...(scenario ? { 'x-qa-scenario': scenario } : {}) }, body: JSON.stringify({ data }) });
  return { status: r.status, body: await r.json(), lookups: Number(r.headers.get('x-qa-lookups')) };
}
async function check(name, run) { await run(); results.push({ name, pass: true }); console.log('PASS ' + name); }
try {
  await check('guest has no account or ledger lookup', async () => { const r = await call(null, { action: 'state' }); assert.equal(r.status, 401); assert.equal(r.lookups, 0); });
  await check('real JWT and precise current Auth admit state and one daily credit', async () => {
    const f = await fixture(), state = await call(f, { action: 'state' }); assert.equal(state.status, 200); assert.equal(state.body.result.wallet.user_id, f.uid);
    const first = await call(f, { action: 'earn', type: 'daily_login', user_id: 'foreign', amount: 10000 }); assert.equal(first.status, 200); assert.equal(first.body.result.balance, 3); assert.equal(first.lookups, 3);
    const repeat = await call(f, { action: 'earn', type: 'daily_login' }); assert.equal(repeat.status, 200); assert.equal(repeat.body.result.balance, 3);
  });
  await check('disabled account cannot read token state', async () => { const f = await fixture(); await auth.updateUser(f.uid, { disabled: true }); const r = await call(f, { action: 'state' }); assert.equal(r.status, 401); });
  await check('deleted account cannot read token state', async () => { const f = await fixture(); await auth.deleteUser(f.uid); assert.equal((await call(f, { action: 'state' })).status, 401); });
  for (const scenario of ['disable-before-commit', 'replace-before-commit', 'fail-commit']) await check(scenario + ' rolls back the actual earning transaction', async () => {
    const f = await fixture(), r = await call(f, { action: 'earn', type: 'daily_login' }, scenario); assert.notEqual(r.status, 200); assert.ok(!r.body.result);
    assert.equal((await db.doc('token_wallets/' + f.uid).get()).exists, false); assert.equal((await db.collection('token_events').where('user_id', '==', f.uid).get()).size, 0);
    assert.equal((await db.collection('_token_credit_receipts').where('user_id', '==', f.uid).get()).size, 0);
  });
  await check('precise Auth lookup detects same-second replacement hidden by Admin metadata', async () => {
    const uid = 'token-admission-' + randomUUID(), stamp = Math.floor((Date.now() - 10_000) / 1000) * 1000 + 123;
    assert.equal((await auth.importUsers([{ uid, metadata: { creationTime: new Date(stamp).toISOString() } }])).failureCount, 0);
    const token = await exchange(uid), decoded = await auth.verifyIdToken(token), before = await auth.getUser(uid), context = await currentTokenAccount(uid, decoded);
    assert.equal(context.createdAtMs, stamp); await auth.deleteUser(uid);
    assert.equal((await auth.importUsers([{ uid, metadata: { creationTime: new Date(stamp + 1).toISOString() } }])).failureCount, 0);
    assert.equal((await auth.getUser(uid)).metadata.creationTime, before.metadata.creationTime);
    await assert.rejects(assertTokenAccountCurrent(context), { code: 'unauthenticated' });
  });
  const seedWallet = (f, balance) => db.doc('token_wallets/' + f.uid).set({ schema_version: 1, id: f.uid, user_id: f.uid, balance, lifetime_earned: balance, lifetime_spent: 0, updated_at: new Date().toISOString() });
  await check('current account owns exactly-once purchases, equipment and boost activation', async () => {
    const f = await fixture(); assert.equal((await call(f, { action: 'state' })).status, 200); await seedWallet(f, 500);
    const purchase = { action: 'purchase', itemId: 'theme_neon', expectedCost: 200, requestId: 'owned-purchase' };
    const first = await call(f, purchase), repeat = await call(f, purchase); assert.equal(first.status, 200); assert.deepEqual(repeat.body.result, first.body.result); assert.equal(first.body.result.balance, 300);
    assert.equal((await call(f, { action: 'equip', type: 'profile_theme', value: 'theme_neon' })).status, 200);
    assert.equal((await call(f, { action: 'purchase', itemId: 'xp_boost_2x', expectedCost: 75, requestId: 'owned-boost' })).status, 200);
    const activation = { action: 'activate', itemId: 'xp_boost_2x', requestId: 'activation' };
    const active = await call(f, activation), again = await call(f, activation); assert.equal(active.status, 200); assert.deepEqual(again.body.result, active.body.result);
    const profileId = (await db.doc('user_auth_index/' + f.uid).get()).data().profile_id;
    assert.equal((await db.doc('profiles/' + profileId).get()).data().equipped_profile_theme, 'theme_neon');
    assert.equal((await db.doc('token_wallets/' + f.uid).get()).data().balance, 225);
    assert.equal((await db.doc('_token_account_authority/' + f.uid).get()).data().auth_created_at_ms, (await currentTokenAccount(f.uid, await auth.verifyIdToken(f.token))).createdAtMs);
  });
  await check('a fresh request after same-second UID recreation cannot inherit balance or purchase replay', async () => {
    const f = await fixture(); assert.equal((await call(f, { action: 'state' })).status, 200); await seedWallet(f, 500);
    const purchase = { action: 'purchase', itemId: 'xp_boost_2x', expectedCost: 75, requestId: 'retained-purchase' };
    assert.equal((await call(f, purchase)).status, 200);
    const ref = db.doc('_token_account_authority/' + f.uid), owner = (await ref.get()).data(), wallet = (await db.doc('token_wallets/' + f.uid).get()).data();
    await auth.deleteUser(f.uid); assert.equal((await auth.importUsers([{ uid: f.uid, metadata: { creationTime: new Date(owner.auth_created_at_ms + 1).toISOString() } }])).failureCount, 0); f.token = await exchange(f.uid);
    for (const input of [{ action: 'state' }, purchase, { action: 'earn', type: 'daily_login' }]) { const r = await call(f, input); assert.equal(r.status, 400); assert.equal(r.body.error.details.reason, 'token-ownership-review'); }
    assert.deepEqual((await ref.get()).data(), owner); assert.deepEqual((await db.doc('token_wallets/' + f.uid).get()).data(), wallet);
    assert.equal((await db.doc('token_entitlements/' + tokenTupleId(f.uid, 'xp_boost_2x')).get()).data().quantity, 1);
  });
  await check('unbound private reward history is preserved for review rather than reset or adopted', async () => {
    const f = await fixture(), profileId = (await db.doc('user_auth_index/' + f.uid).get()).data().profile_id;
    const ref = db.doc('_verified_xp_authority/' + f.uid), row = { schema_version: 1, user_id: f.uid, profile_id: profileId, verified_total_xp: 50, updated_at: new Date().toISOString() }; await ref.set(row);
    const r = await call(f, { action: 'state' }); assert.equal(r.status, 400); assert.equal(r.body.error.details.reason, 'token-ownership-review');
    assert.deepEqual((await ref.get()).data(), row); assert.equal((await db.doc('_token_account_authority/' + f.uid).get()).exists, false);
  });
  await check('missing owner record cannot silently reinitialize a nonempty ledger', async () => {
    const f = await fixture(); assert.equal((await call(f, { action: 'state' })).status, 200); await seedWallet(f, 200); await db.doc('_token_account_authority/' + f.uid).delete();
    assert.equal((await call(f, { action: 'state' })).status, 400); assert.equal((await db.doc('token_wallets/' + f.uid).get()).data().balance, 200);
    assert.equal((await db.doc('_token_account_authority/' + f.uid).get()).exists, false);
  });
  await check('disabled admission before owner commit leaves no partial owner record', async () => {
    const f = await fixture(), r = await call(f, { action: 'state' }, 'disable-before-owner-commit'); assert.equal(r.status, 401);
    assert.equal((await db.doc('_token_account_authority/' + f.uid).get()).exists, false);
  });
  await check('first owner initialization and an old writer cannot both succeed under contention', async () => {
    for (let i = 0; i < 6; i++) {
      const f = await fixture(), profileId = (await db.doc('user_auth_index/' + f.uid).get()).data().profile_id, account = await currentTokenAccount(f.uid, await auth.verifyIdToken(f.token));
      const results = await Promise.allSettled([resolveTokenActor(db, f.uid, account), claimTokenCredit(db, { authUid: f.uid, profileId }, { type: 'daily_login' })]);
      assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
      const owner = await db.doc('_token_account_authority/' + f.uid).get(), wallet = await db.doc('token_wallets/' + f.uid).get();
      assert.ok(owner.exists !== wallet.exists); if (wallet.exists) assert.equal(wallet.data().balance, 3);
    }
  });
  await check('matched authenticated challenge sync, XP claim and token credit share the durable owner', async () => {
    const f = await fixture(), challengeId = 'ownership-' + randomUUID();
    await db.doc('challenges/' + challengeId).set({ type: 'achievement', is_active: true, requirement_type: 'login', requirement_count: 1, reward_xp: 25, reward_badge_id: null });
    const sync = await call(f, { force: true }, undefined, 'syncMyChallengeProgress'); assert.equal(sync.status, 200); assert.ok(sync.body.result.changes.some(row => row.challenge_id === challengeId && row.is_completed));
    const rewardId = f.uid + '_' + challengeId, claim = await call(f, { p_reward_id: rewardId }, undefined, 'claimChallengeReward'); assert.equal(claim.status, 200); assert.equal(claim.body.result.xp_gained, 25);
    const repeat = await call(f, { p_reward_id: rewardId }, undefined, 'claimChallengeReward'); assert.equal(repeat.status, 200); assert.equal(repeat.body.result.xp_gained, 0);
    assert.equal((await db.doc('_verified_xp_authority/' + f.uid).get()).data().verified_total_xp, 25);
    const credit = await call(f, { action: 'earn', type: 'challenge_completed', referenceId: challengeId }); assert.equal(credit.status, 200); assert.equal(credit.body.result.credited, 25);
  });
  await fs.mkdir('work/token-ledger-ownership', { recursive: true });
  await fs.writeFile('work/token-ledger-ownership/verification-sdk.json', JSON.stringify({ checkedAt: new Date().toISOString(), runtime: process.version, results, scope: 'Actual callables, real demo JWT/Auth/Firestore. Durable owner, replay, contention, financial and interactive reward paths. Historical reconciliation, staff award cutover and production readiness remain separate.' }, null, 2) + '\n');
} finally {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-token-admission');
  const firestore = await fetch('http://127.0.0.1:8387/emulator/v1/projects/demo-vybe-token-admission/databases/(default)/documents', { method: 'DELETE' }); assert.ok(firestore.ok);
  const users = await auth.listUsers(); for (const user of users.users) { assert.match(user.uid, /^token-admission-[0-9a-f-]{36}$/); await auth.deleteUser(user.uid); }
  assert.equal((await auth.listUsers()).users.length, 0); console.log('Cleared only the exclusive owned demo project');
}
