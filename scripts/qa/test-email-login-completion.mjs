import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-login-completion');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9200');
const root = path.resolve('work/login-email-completion-release/functions');
const load = name => import(pathToFileURL(path.join(root, 'lib/_shared/' + name + '.js')).href);
const { db, auth } = await load('admin');
const { ensureAccountProfileForUid } = await load('accountProfileAuthority');
const { requestEmailChallenge, verifyEmailChallenge } = await load('emailChallengeAuthority');
const owned = [], results = [];
async function exchange(token) {
  const r = await fetch('http://127.0.0.1:9200/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-local-only', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, returnSecureToken: true }) });
  assert.equal(r.status, 200); return (await r.json()).idToken;
}
async function fixture() {
  const uid = 'email-complete-' + randomUUID(), user = await auth.createUser({ uid, email: uid + '@example.test' }); owned.push(uid);
  const created = Date.parse(user.metadata.creationTime);
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: created, requestId: randomUUID() });
  await db.doc('user_2fa_settings/' + uid).set({ email_2fa_enabled: true, login_approvals_enabled: true });
  let code; const issued = await requestEmailChallenge(db, auth, async (_email, value) => { code = value; return true; }, uid, { expectedOwnerUid: uid });
  const verified = await verifyEmailChallenge(db, auth, null, { challengeId: issued.challengeId, code });
  const token = await exchange(verified.customToken), claims = await auth.verifyIdToken(token);
  return { uid, token, input: { expectedOwnerUid: uid, expectedAuthTime: claims.auth_time, expectedAccountCreatedAt: created, deviceFingerprint: randomUUID(), method: 'email_2fa', expectedEmailChallengeId: issued.challengeId } };
}
async function call(target, f, scenario, patch = {}) {
  const start = performance.now(), r = await fetch('http://127.0.0.1:8358/' + target, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(f ? { Authorization: 'Bearer ' + f.token } : {}), ...(scenario ? { 'x-qa-scenario': scenario } : {}) }, body: JSON.stringify({ data: f ? { ...f.input, ...patch } : {} }) });
  return { status: r.status, body: await r.json(), ms: Math.round(performance.now() - start), transactions: Number(r.headers.get('x-qa-transactions')), authReads: Number(r.headers.get('x-qa-auth-reads')) };
}
async function check(name, run) { const evidence = await run(); results.push({ name, ...evidence }); console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : '')); }
async function checkedReceipt(f, r) {
  assert.equal(r.status, 200); assert.equal(r.body.result.ownerUid, f.uid); assert.equal(r.body.result.confirmedEmailChallengeId, f.input.expectedEmailChallengeId);
  assert.equal(r.body.result.requiresApproval, false); assert.equal(r.body.result.reason, 'email_confirmed');
  const row = (await db.doc('user_sessions/' + r.body.result.sessionId).get()).data();
  assert.equal(row.user_id, f.uid); assert.equal(row.trusted, true); assert.equal(row.pending_approval, false); assert.equal(row.email_confirmation_id, f.input.expectedEmailChallengeId);
}
try {
  await check('guest cannot reach device mutation', async () => { const r = await call('candidate'); assert.equal(r.status, 401); assert.equal(r.transactions, 0); });
  let baseline;
  await check('real baseline confirms trust with three transactions', async () => { const f = await fixture(), r = await call('baseline', f); await checkedReceipt(f, r); assert.equal(r.transactions, 3); baseline = r; return { ms: r.ms, transactions: r.transactions, authReads: r.authReads }; });
  await check('candidate returns the committed owned receipt with two transactions', async () => { const f = await fixture(), r = await call('candidate', f); await checkedReceipt(f, r); assert.equal(r.transactions, 2); assert.ok(r.authReads < baseline.authReads); return { ms: r.ms, transactions: r.transactions, authReads: r.authReads }; });
  await check('same current device can repeat completion without creating another session', async () => { const f = await fixture(), first = await call('candidate', f), second = await call('candidate', f); await checkedReceipt(f, first); await checkedReceipt(f, second); assert.equal(first.body.result.sessionId, second.body.result.sessionId); assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).size, 1); });
  await check('wrong token claim cannot borrow a consumed challenge', async () => { const f = await fixture(); f.token = await exchange(await auth.createCustomToken(f.uid)); const r = await call('candidate', f); assert.equal(r.status, 400); assert.equal(r.transactions, 0); });
  for (const scenario of ['retire-binding', 'disable-account', 'invalidate-proof', 'revoke-device', 'fail-commit']) await check(scenario + ' before final commit cannot return success or trust the device', async () => {
    const f = await fixture(), r = await call('candidate', f, scenario); assert.notEqual(r.status, 200); assert.ok(!r.body.result);
    const docs = await db.collection('user_sessions').where('user_id', '==', f.uid).get(); assert.equal(docs.size, 1);
    assert.equal(docs.docs[0].data().trusted, false); assert.ok(!docs.docs[0].data().email_confirmation_id);
    return { status: r.status };
  });
  await fs.writeFile('work/login-email-completion-release/verification-sdk.json', JSON.stringify({ checkedAt: new Date().toISOString(), runtime: process.version, scope: 'Actual baseline/candidate HTTP callables, real demo Auth/Firestore and email proof/custom token. Geo/mail synthetic;120ms injected per transaction. Local timings do not establish production speed.', results }, null, 2) + '\n');
} finally {
  const collections = ['profiles', 'user_auth_index', '_account_profile_bindings', '_account_profile_requests', '_account_profile_receipts', '_auth_device_session_heads', 'user_sessions', 'user_2fa_settings', 'auth_challenges', '_auth_email_challenges', '_auth_email_limits', 'login_history'];
  for (const uid of owned) {
    for (const name of collections) {
      const refs = new Map(); for (const key of ['user_id', 'owner_uid']) for (const doc of (await db.collection(name).where(key, '==', uid).get()).docs) refs.set(doc.ref.path, doc.ref);
      refs.set(name + '/' + uid, db.doc(name + '/' + uid)); for (const ref of refs.values()) await ref.delete();
    }
    await auth.deleteUser(uid);
  }
  console.log('Cleaned owned demo accounts and known fixture records');
}
