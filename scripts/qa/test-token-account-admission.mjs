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
async function call(f, data, scenario) {
  const r = await fetch('http://127.0.0.1:8358/tokenMarketplace', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(f ? { Authorization: 'Bearer ' + f.token, 'x-qa-uid': f.uid } : {}), ...(scenario ? { 'x-qa-scenario': scenario } : {}) }, body: JSON.stringify({ data }) });
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
  await fs.mkdir('work/token-account-admission', { recursive: true });
  await fs.writeFile('work/token-account-admission/verification-sdk.json', JSON.stringify({ checkedAt: new Date().toISOString(), runtime: process.version, results, scope: 'Actual callable, real demo JWT/Auth account lookup/Firestore. Proves request-lifetime account admission, not durable wallet incarnation/history reconciliation or production readiness.' }, null, 2) + '\n');
} finally {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-token-admission');
  const firestore = await fetch('http://127.0.0.1:8387/emulator/v1/projects/demo-vybe-token-admission/databases/(default)/documents', { method: 'DELETE' }); assert.ok(firestore.ok);
  const users = await auth.listUsers(); for (const user of users.users) { assert.match(user.uid, /^token-admission-[0-9a-f-]{36}$/); await auth.deleteUser(user.uid); }
  assert.equal((await auth.listUsers()).users.length, 0); console.log('Cleared only the exclusive owned demo project');
}
