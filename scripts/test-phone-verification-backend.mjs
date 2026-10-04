import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-contacts-qa');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { readPhoneVerification: state, requestPhoneVerification: request, confirmPhoneVerification: confirm } = await import('../functions/lib/_shared/phoneVerificationAuthority.js');
const { phoneVerifyRequest, phoneVerificationState } = await import('../functions/lib/phoneVerification.js');
const { auth2faVerifyPhone } = await import('../functions/lib/auth.js');
const { contactDiscovery, hashPhoneE164Server } = await import('../functions/lib/_shared/contactDiscoveryAuthority.js');
let checks = 0, sequence = 0;
const provider = { start: async () => {}, check: async (_phone, code) => code === '123456' };
const fixture = async () => {
  const n = ++sequence, uid = `phone-qa-${n}`, profileId = `phone-profile-${n}`, phone = `+1555555${String(n).padStart(4, '0')}`;
  await auth.createUser({ uid }); await db.doc(`profiles/${profileId}`).set({ user_id: uid, username: uid }); await db.doc(`user_auth_index/${uid}`).set({ profile_id: profileId });
  const binding = { expectedOwnerUid: uid, expectedProfileId: profileId };
  const send = { ...binding, phone, requestId: randomUUID() };
  const verify = { ...binding, challengeId: send.requestId, code: '123456' };
  return { uid, profileId, phone, binding, send, verify, ref: db.doc(`_phone_verifications/${uid}`) };
};
const check = async (name, test) => { await test(); checks++; console.log(`PASS ${name}`); };
try {
  await check('strict identity, actor binding, disabled account and recent sign-in are required', async () => {
    const f = await fixture();
    await assert.rejects(state(db, auth, f.uid, { ...f.binding, expectedOwnerUid: 'other' }), { code: 'failed-precondition' });
    await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, expectedProfileId: 'other' }), { code: 'failed-precondition' });
    await assert.rejects(phoneVerificationState.run({ data: f.binding }), { code: 'unauthenticated' });
    await assert.rejects(phoneVerifyRequest.run({ auth: { uid: f.uid, token: { auth_time: 1 } }, data: f.send }), { code: 'failed-precondition' });
    await db.doc(`profiles/${f.uid}`).set({ user_id: 'borrowed' }); await assert.rejects(state(db, auth, f.uid, f.binding), { code: 'failed-precondition' }); await db.doc(`profiles/${f.uid}`).delete();
    await auth.updateUser(f.uid, { disabled: true }); await assert.rejects(request(db, auth, provider, f.uid, f.send), { code: 'permission-denied' });
  });
  await check('public legacy flags are never proof or SMS login authority', async () => {
    const f = await fixture();
    await db.doc(`profiles/${f.profileId}`).update({ phone_number: f.phone, phone_verified: true, phone_e164_sha256: hashPhoneE164Server(f.phone) });
    const before = await state(db, auth, f.uid, f.binding); assert.equal(before.verified, false); assert.equal(before.maskedPhone, null); assert.equal(before.legacyPhoneNeedsVerification, true);
    await db.doc(`auth_challenges/${f.uid}`).set({ user_id: f.uid, challenge_type: 'login_approval', channel: 'sms', provider: 'twilio_verify', phone_e164: f.phone, status: 'pending', expires_at: Date.now() + 60_000, metadata: { switched_to: 'sms_code' } });
    await assert.rejects(auth2faVerifyPhone.run({ data: { challengeId: f.uid, code: '123456' } }), { code: 'permission-denied' });
    await db.doc(`auth_challenges/${f.uid}`).update({ challenge_type: 'phone', provider: 'legacy', code_hash: '123456' });
    await assert.rejects(auth2faVerifyPhone.run({ auth: { uid: f.uid, token: {} }, data: { challengeId: f.uid, code: '123456', phone: f.phone } }), { code: 'permission-denied' });
  });
  await check('strict E164, UUID, six digits and no arbitrary profile fields', async () => {
    const f = await fixture();
    for (const phone of ['5555551234', '+1555555 ext123', '+012345678', '+123', '+1111111111111111']) await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, phone }), { code: 'invalid-argument' });
    await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, purpose: 'change' }), { code: 'invalid-argument' });
    await assert.rejects(confirm(db, auth, provider, f.uid, { ...f.verify, code: 'abcdef' }), { code: 'invalid-argument' });
    assert.equal((await f.ref.get()).exists, false);
  });
  await check('send retry reuses one challenge without sending twice; wrong code never links', async () => {
    const f = await fixture(); let sent = 0;
    const fake = { ...provider, start: async () => { sent++; } };
    const first = await request(db, auth, fake, f.uid, f.send), retry = await request(db, auth, fake, f.uid, f.send);
    assert.deepEqual(retry, first); assert.equal(sent, 1); assert.equal(first.maskedPhone, `+•••${f.phone.slice(-4)}`); assert.equal(Object.hasOwn(first, 'phone'), false);
    await assert.rejects(confirm(db, auth, fake, f.uid, { ...f.verify, code: '654321' }), { code: 'permission-denied' }); assert.equal((await auth.getUser(f.uid)).phoneNumber, undefined);
  });
  await check('verified SMS links Auth, removes only own legacy phone fields and enables explicit discovery', async () => {
    const f = await fixture(); await db.doc(`profiles/${f.profileId}`).update({ phone_number: f.phone, phone_verified: true, phone_e164_sha256: 'forged' });
    await request(db, auth, provider, f.uid, f.send); const result = await confirm(db, auth, provider, f.uid, f.verify);
    assert.equal(result.phone, f.phone); assert.equal(result.ownerUid, f.uid); assert.equal((await auth.getUser(f.uid)).phoneNumber, f.phone);
    const row = (await db.doc(`profiles/${f.profileId}`).get()).data(); for (const field of ['phone_number', 'phone_verified', 'phone_e164_sha256']) assert.equal(Object.hasOwn(row, field), false);
    assert.equal((await db.doc(`profiles/${f.uid}`).get()).exists, false);
    assert.equal((await state(db, auth, f.uid, f.binding)).verified, true);
    const discovery = await contactDiscovery(db, auth, f.uid, { ...f.binding, action: 'state' }); assert.equal(discovery.eligible, true); assert.equal(discovery.discoverable, false);
    assert.equal((await contactDiscovery(db, auth, f.uid, { ...f.binding, action: 'setDiscoverable', discoverable: true })).discoverable, true);
    assert.deepEqual(await confirm(db, auth, { ...provider, check: async () => { throw Error('must not recheck consumed provider code'); } }, f.uid, f.verify), result);
  });
  await check('resend supersedes the old challenge and expiry prevents a link', async () => {
    const f = await fixture(); await request(db, auth, provider, f.uid, f.send);
    const next = { ...f.send, requestId: randomUUID() }; await request(db, auth, provider, f.uid, next);
    await assert.rejects(confirm(db, auth, provider, f.uid, f.verify), { code: 'permission-denied' });
    await f.ref.update({ expires_at: Date.now() - 1 }); await assert.rejects(confirm(db, auth, provider, f.uid, { ...f.verify, challengeId: next.requestId }), { code: 'failed-precondition' });
    assert.equal((await auth.getUser(f.uid)).phoneNumber, undefined);
  });
  await check('failed SMS never advances; legacy public fields cannot reserve another number', async () => {
    const f = await fixture(); await db.doc('profiles/phone-legacy-squatter').set({ user_id: 'phone-other', phone_number: f.phone, phone_verified: true, phone_e164_sha256: hashPhoneE164Server(f.phone) });
    await assert.rejects(request(db, auth, { ...provider, start: async () => { throw Error('network'); } }, f.uid, f.send), { code: 'unavailable' });
    assert.equal((await f.ref.get()).data().status, 'failed'); assert.equal(Object.hasOwn((await f.ref.get()).data(), 'phone'), false);
    await request(db, auth, provider, f.uid, f.send); await confirm(db, auth, provider, f.uid, f.verify); assert.equal((await auth.getUser(f.uid)).phoneNumber, f.phone);
    assert.equal((await db.doc('profiles/phone-legacy-squatter').get()).data().phone_number, f.phone);
  });
  await check('another Auth owner reserves the number both before send and at confirmation', async () => {
    const f = await fixture(), other = await fixture(); await auth.updateUser(other.uid, { phoneNumber: f.phone });
    await assert.rejects(request(db, auth, provider, f.uid, f.send), { code: 'already-exists' }); await auth.updateUser(other.uid, { phoneNumber: null });
    await request(db, auth, provider, f.uid, f.send); await auth.updateUser(other.uid, { phoneNumber: f.phone });
    await assert.rejects(confirm(db, auth, provider, f.uid, f.verify), { code: 'already-exists' }); assert.equal((await auth.getUser(f.uid)).phoneNumber, undefined);
  });
  await check('only one worker may write Auth while simultaneous verifies and new sends wait', async () => {
    const f = await fixture(); await request(db, auth, provider, f.uid, f.send);
    let entered; const started = new Promise(resolve => { entered = resolve; }); let release; const held = new Promise(resolve => { release = resolve; }); let writes = 0;
    const delayed = { getUser: uid => auth.getUser(uid), getUserByPhoneNumber: phone => auth.getUserByPhoneNumber(phone), updateUser: async (...args) => { writes++; entered(); await held; return auth.updateUser(...args); } };
    const pending = confirm(db, delayed, provider, f.uid, f.verify); await started;
    await assert.rejects(confirm(db, delayed, provider, f.uid, f.verify), { code: 'unavailable' });
    await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, requestId: randomUUID() }), { code: 'failed-precondition' }); release(); await pending; assert.equal(writes, 1);
  });
  await check('lost Auth response resumes from protected proof without another SMS check', async () => {
    const f = await fixture(); await request(db, auth, provider, f.uid, f.send);
    const lost = { getUser: uid => auth.getUser(uid), getUserByPhoneNumber: phone => auth.getUserByPhoneNumber(phone), updateUser: async (...args) => { await auth.updateUser(...args); throw Error('response lost'); } };
    await assert.rejects(confirm(db, lost, provider, f.uid, f.verify), { code: 'unavailable' });
    await f.ref.update({ link_until: Date.now() - 1 });
    const result = await confirm(db, auth, { ...provider, check: async () => { throw Error('consumed'); } }, f.uid, f.verify); assert.equal(result.phone, f.phone);
  });
  await check('late check cannot link after profile/account/challenge changes', async () => {
    for (const change of ['profile', 'challenge', 'disabled']) {
      const f = await fixture(); await request(db, auth, provider, f.uid, f.send);
      const delayed = { ...provider, check: async () => { if (change === 'profile') await db.doc(`user_auth_index/${f.uid}`).update({ profile_id: 'changed' }); else if (change === 'challenge') await f.ref.update({ challenge_id: randomUUID() }); else await auth.updateUser(f.uid, { disabled: true }); return true; } };
      await assert.rejects(confirm(db, auth, delayed, f.uid, f.verify)); assert.equal((await auth.getUser(f.uid)).phoneNumber, undefined);
    }
  });
  await check('Auth phone changes during a provider check release the old proof for a fresh request', async () => {
    const f = await fixture(); await request(db, auth, provider, f.uid, f.send);
    await assert.rejects(confirm(db, auth, { ...provider, check: async () => { await auth.updateUser(f.uid, { phoneNumber: '+15555559996' }); return true; } }, f.uid, f.verify), { code: 'failed-precondition' });
    assert.equal((await f.ref.get()).data().status, 'failed');
    const next = await request(db, auth, provider, f.uid, { ...f.send, requestId: randomUUID() }); assert.ok(next.challengeId);
  });
  await check('number ownership probes require canonical identity and consume bounded send quota', async () => {
    const f = await fixture(), other = await fixture(); await auth.updateUser(other.uid, { phoneNumber: f.phone });
    await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, expectedProfileId: 'wrong' }), { code: 'failed-precondition' });
    for (let n = 0; n < 3; n++) await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, requestId: randomUUID() }), { code: 'already-exists' });
    await assert.rejects(request(db, auth, provider, f.uid, { ...f.send, requestId: randomUUID() }), { code: 'resource-exhausted' });
  });
  await check('completed proof never restores a subsequently changed Auth phone', async () => {
    const f = await fixture(); await request(db, auth, provider, f.uid, f.send); await confirm(db, auth, provider, f.uid, f.verify);
    await auth.updateUser(f.uid, { phoneNumber: '+15555559998' }); await assert.rejects(confirm(db, auth, provider, f.uid, f.verify), { code: 'failed-precondition' }); assert.equal((await auth.getUser(f.uid)).phoneNumber, '+15555559998');
  });
  await check('send and verification quotas are atomic and contain no plaintext phone', async () => {
    const f = await fixture(); await db.doc(`_phone_verification_limits/${f.uid}`).set({ send_at: Date.now(), send_count: 3 }); await assert.rejects(request(db, auth, provider, f.uid, f.send), { code: 'resource-exhausted' });
    await db.doc(`_phone_verification_limits/${f.uid}`).delete(); await request(db, auth, provider, f.uid, f.send); await db.doc(`_phone_verification_limits/${f.uid}`).set({ confirm_at: Date.now(), confirm_count: 9 });
    const result = await Promise.allSettled([confirm(db, auth, provider, f.uid, { ...f.verify, code: '654321' }), confirm(db, auth, provider, f.uid, { ...f.verify, code: '654321' })]);
    assert.equal(result.filter(row => row.reason?.code === 'resource-exhausted').length, 1); assert.ok(!JSON.stringify((await db.doc(`_phone_verification_limits/${f.uid}`).get()).data()).includes(f.phone));
  });
  await check('SMS login uses current Auth ownership, rejects denial races and consumes a challenge once', async () => {
    const f = await fixture(); await auth.updateUser(f.uid, { phoneNumber: f.phone });
    const originalFetch = globalThis.fetch;
    const previousEnv = Object.fromEntries(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_VERIFY_SERVICE_SID'].map(key => [key, process.env[key]]));
    process.env.TWILIO_ACCOUNT_SID = 'ACsynthetic-local-account'; process.env.TWILIO_AUTH_TOKEN = 'synthetic-local-token'; process.env.TWILIO_VERIFY_SERVICE_SID = 'VAsynthetic-local-service';
    const challengeId = randomUUID(), ref = db.doc(`auth_challenges/${challengeId}`);
    const base = { user_id: f.uid, challenge_type: 'login_approval', channel: 'sms', provider: 'twilio_verify', phone_e164: f.phone, status: 'pending', expires_at: Date.now() + 60_000, metadata: { switched_to: 'sms_code' } };
    let duringCheck = async () => {};
    globalThis.fetch = async (url, options) => {
      if (String(url).startsWith('https://verify.twilio.com/')) { await duringCheck(); return new Response(JSON.stringify({ status: 'approved', valid: true }), { status: 200 }); }
      if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(String(url))) throw Error('External network forbidden in phone QA');
      return originalFetch(url, options);
    };
    try {
      await ref.set(base);
      const result = await auth2faVerifyPhone.run({ data: { challengeId, code: '123456', phone: '+19999999999' } });
      assert.equal(result.status, 'approved'); assert.equal(result.phone, f.phone); assert.ok(result.customToken);
      await assert.rejects(auth2faVerifyPhone.run({ data: { challengeId, code: '123456' } }), { code: 'failed-precondition' });
      await ref.set(base); duringCheck = () => ref.update({ status: 'denied' });
      await assert.rejects(auth2faVerifyPhone.run({ data: { challengeId, code: '123456' } }), { code: 'permission-denied' }); assert.equal((await ref.get()).data().status, 'denied');
      await ref.set(base); duringCheck = () => ref.update({ metadata: { switched_to: 'email_code' } });
      await assert.rejects(auth2faVerifyPhone.run({ data: { challengeId, code: '123456' } }), { code: 'permission-denied' }); assert.equal((await ref.get()).data().status, 'pending');
      await ref.set(base); duringCheck = () => auth.updateUser(f.uid, { phoneNumber: '+15555559997' });
      await assert.rejects(auth2faVerifyPhone.run({ data: { challengeId, code: '123456' } }), { code: 'permission-denied' }); assert.equal((await ref.get()).data().status, 'pending');
    } finally { globalThis.fetch = originalFetch; for (const [key, value] of Object.entries(previousEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
  });
  await check('provider outages and malformed receipts never masquerade as incorrect codes or sent SMS', async () => {
    const { twilioVerifyCheck, twilioVerifyStart } = await import('../functions/lib/_shared/twilioVerify.js');
    const originalFetch = globalThis.fetch, config = { accountSid: 'ACsynthetic', authToken: 'synthetic', verifyServiceSid: 'VAsynthetic' };
    try {
      for (const status of [401, 429, 500]) { globalThis.fetch = async () => new Response('{}', { status }); await assert.rejects(twilioVerifyCheck(config, '+15555550000', '123456'), { code: 'unavailable' }); }
      globalThis.fetch = async () => new Response('{}', { status: 200 }); await assert.rejects(twilioVerifyCheck(config, '+15555550000', '123456'), { code: 'unavailable' }); assert.equal((await twilioVerifyStart(config, '+15555550000')).ok, false);
      globalThis.fetch = async () => new Response(JSON.stringify({ status: 'pending', valid: false }), { status: 200 }); assert.equal((await twilioVerifyCheck(config, '+15555550000', '123456')).ok, false);
      globalThis.fetch = async () => new Response(JSON.stringify({ status: 'approved', valid: true }), { status: 200 }); assert.equal((await twilioVerifyCheck(config, '+15555550000', '123456')).ok, true);
    } finally { globalThis.fetch = originalFetch; }
  });
  console.log(`Phone verification: ${checks} backend groups passed. Twilio is a deterministic injected test provider; no SMS was sent.`);
} finally { await db.terminate(); }
