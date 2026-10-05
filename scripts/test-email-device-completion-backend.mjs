import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-login-device-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { requestEmailChallenge, verifyEmailChallenge } = await import('../functions/lib/_shared/emailChallengeAuthority.js');
const { registerLoginDevice, withCurrentLoginDevice } = await import('../functions/lib/_shared/loginDeviceAuthority.js');
const { runAuthLoginNotify } = await import('../functions/lib/auth.js');
const providers = { geo: async () => ({ ip: null }), send: async () => { throw Error('No push should be attempted after email confirmation'); } };
let groups = 0;
const check = async (name, run) => { await run(); console.log(`PASS ${++groups} ${name}`); };
async function exchange(customToken) {
  const exchanged = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=isolated-qa`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  assert.equal(exchanged.status, 200);
  const body = await exchanged.json(); return auth.verifyIdToken(body.idToken);
}
async function fixture(verify = true) {
  const uid = `completion-${randomUUID()}`, email = `${uid}@example.test`;
  const user = await auth.createUser({ uid, email }), created = Date.parse(user.metadata.creationTime), fingerprint = randomUUID();
  await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: created, requestId: randomUUID() });
  await db.doc(`user_2fa_settings/${uid}`).set({ email_2fa_enabled: true, login_approvals_enabled: true });
  let sentCode;
  const start = await requestEmailChallenge(db, auth, async (destination, code) => { assert.equal(destination, email); sentCode = code; return true; }, uid, { expectedOwnerUid: uid });
  let token;
  if (verify) {
    const completed = await verifyEmailChallenge(db, auth, null, { challengeId: start.challengeId, code: sentCode });
    token = await exchange(completed.customToken);
    assert.equal(token.email_2fa, start.challengeId); assert.equal(token.uid, uid);
  } else token = { uid, auth_time: Math.floor(Date.now() / 1000), email_2fa: start.challengeId };
  const input = (patch = {}) => ({ expectedOwnerUid: uid, expectedAccountCreatedAt: created, expectedAuthTime: token.auth_time,
    deviceFingerprint: fingerprint, method: 'email_2fa', expectedEmailChallengeId: start.challengeId, ...patch });
  const request = (patch = {}, claims = token) => ({ auth: { uid, token: claims }, data: input(patch), rawRequest: { ip: '127.0.0.1' } });
  return { uid, email, created, fingerprint, token, id: start.challengeId, input, request,
    secret: db.doc(`_auth_email_challenges/${start.challengeId}`), public: db.doc(`auth_challenges/${start.challengeId}`) };
}
await check('real verified email token finalizes before resume; exact retry preserves the generation', async () => {
  const f = await fixture();
  await db.doc(`user_sessions/other-${randomUUID()}`).set({ user_id: f.uid, trusted: true, revoked_at: null });
  await assert.rejects(runAuthLoginNotify(f.request({ method: 'session_resume' }), providers), { code: 'failed-precondition' });
  const completed = await runAuthLoginNotify(f.request(), providers);
  assert.equal(completed.confirmedEmailChallengeId, f.id); assert.equal(completed.requiresApproval, false); assert.equal(completed.trackingDeferred, false);
  const row = (await db.doc(`user_sessions/${completed.sessionId}`).get()).data();
  assert.equal(row.trusted, true); assert.equal(row.pending_approval, false); assert.equal(row.email_confirmation_id, f.id);
  const retried = await runAuthLoginNotify(f.request(), providers); assert.equal(retried.sessionId, completed.sessionId); assert.equal(retried.confirmedEmailChallengeId, f.id);
  const resumed = await runAuthLoginNotify(f.request({ method: 'session_resume' }), providers); assert.equal(resumed.requiresApproval, false); assert.equal(resumed.sessionId, completed.sessionId);
});
await check('caller method or expected ID cannot substitute for verified token proof', async () => {
  const f = await fixture(), { email_2fa: _email, ...noClaim } = f.token;
  for (const [body, claims] of [[{}, noClaim], [{ expectedEmailChallengeId: undefined }, f.token], [{ expectedEmailChallengeId: randomUUID() }, f.token]]) {
    await assert.rejects(runAuthLoginNotify(f.request(body, claims), providers), { code: 'failed-precondition' });
  }
  assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).empty, true);
});
await check('device approval deliberately switched to email finalizes that pending device after real code verification', async () => {
  const f = await fixture(false);
  await db.doc(`user_sessions/other-${randomUUID()}`).set({ user_id: f.uid, trusted: true, revoked_at: null });
  const pending = await runAuthLoginNotify(f.request({ method: 'password', expectedEmailChallengeId: undefined }), { ...providers, send: async () => ({ ok: true }) });
  assert.equal(pending.requiresApproval, true); let code;
  const switched = await requestEmailChallenge(db, auth, async (email, sent) => { assert.equal(email, f.email); code = sent; return true; }, null,
    { challengeId: pending.challengeId }, { allowLoginSwitch: true });
  const completed = await verifyEmailChallenge(db, auth, null, { challengeId: switched.challengeId, code });
  const token = await exchange(completed.customToken);
  const freshRequest = f.request({ expectedAuthTime: token.auth_time, expectedEmailChallengeId: switched.challengeId }, token);
  const receipt = await runAuthLoginNotify(freshRequest, providers);
  assert.equal(receipt.confirmedEmailChallengeId, switched.challengeId); assert.equal(receipt.sessionId, pending.sessionId); assert.equal(receipt.requiresApproval, false);
  const row = (await db.doc(`user_sessions/${receipt.sessionId}`).get()).data(); assert.equal(row.trusted, true); assert.equal(row.pending_approval, false);
  assert.equal(Object.hasOwn((await db.doc(`auth_challenges/${switched.challengeId}`).get()).data().metadata, 'custom_token'), false);
  const resumed = await runAuthLoginNotify({ ...freshRequest, data: { ...freshRequest.data, method: 'session_resume' } }, providers);
  assert.equal(resumed.sessionId, receipt.sessionId); assert.equal(resumed.requiresApproval, false);
});
await check('pending, expired, wrong-account, changed-email and superseded proof cannot grant trust', async () => {
  for (const mode of ['pending', 'stale', 'owner', 'incarnation', 'email', 'revision', 'denied', 'older-token']) {
    const f = await fixture(mode !== 'pending');
    let claims = f.token;
    if (mode === 'stale') await f.secret.update({ consumed_at: Date.now() - 11 * 60_000 });
    if (mode === 'owner') await f.secret.update({ owner_uid: 'other' });
    if (mode === 'incarnation') await f.secret.update({ auth_created_at: new Date(f.created - 1000).toISOString() });
    if (mode === 'email') await auth.updateUser(f.uid, { email: `changed-${f.email}` });
    if (mode === 'revision') await f.public.update({ email_revision: 'f'.repeat(48) });
    if (mode === 'denied') await f.public.update({ status: 'denied' });
    if (mode === 'older-token') { await f.secret.update({ consumed_at: Date.now() + 900 }); claims = { ...f.token, auth_time: f.token.auth_time - 1 }; }
    await assert.rejects(runAuthLoginNotify(f.request({ expectedAuthTime: claims.auth_time }, claims), providers));
    assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).empty, true);
  }
});
await check('source change or recreation after registration cannot finalize or issue a trusted receipt', async () => {
  for (const mode of ['secret-recreated', 'public-recreated', 'denied']) {
    const f = await fixture(), registered = await registerLoginDevice(db, auth, f.uid, f.token.auth_time, f.input(), {}, Date.now(), f.token);
    const ref = mode === 'secret-recreated' ? f.secret : f.public;
    if (mode === 'denied') await ref.update({ status: 'denied' });
    else { const row = (await ref.get()).data(); await ref.delete(); await ref.set(row); }
    await assert.rejects(withCurrentLoginDevice(db, auth, registered, f.fingerprint, (tx, session) => tx.update(session, { trusted: true }), Date.now(), { trust: 'email-confirmed' }));
    assert.equal((await db.doc(`user_sessions/${registered.sessionId}`).get()).data().trusted, false);
  }
});
await check('revocation after registration wins over email completion and never recreates a deleted row', async () => {
  for (const mode of ['revoked', 'deleted']) {
    const f = await fixture(), registered = await registerLoginDevice(db, auth, f.uid, f.token.auth_time, f.input(), {}, Date.now(), f.token);
    const ref = db.doc(`user_sessions/${registered.sessionId}`);
    if (mode === 'revoked') await ref.update({ revoked_at: new Date().toISOString() }); else await ref.delete();
    await assert.rejects(withCurrentLoginDevice(db, auth, registered, f.fingerprint, (tx, session) => tx.update(session, { trusted: true }), Date.now(), { trust: 'email-confirmed' }), { code: 'unauthenticated' });
    if (mode === 'deleted') assert.equal((await ref.get()).exists, false);
  }
});
await check('a delayed current-Auth email change retires the checked completion', async () => {
  const f = await fixture(), record = await auth.getUser(f.uid); let reads = 0;
  await assert.rejects(registerLoginDevice(db, { getUser: async () => ({ ...record, email: ++reads > 1 ? `changed-${record.email}` : record.email }) }, f.uid, f.token.auth_time, f.input(), {}, Date.now(), f.token));
  assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).empty, true);
});
console.log(`PASS ${groups} email completion backend groups; real Auth token exchange, injected email only.`);
