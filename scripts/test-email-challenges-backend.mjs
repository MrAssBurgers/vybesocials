import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-contacts-qa');
for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) assert.match(process.env[key] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { requestEmailChallenge: request, verifyEmailChallenge: verify } = await import('../functions/lib/_shared/emailChallengeAuthority.js');
const { auth2faRequest } = await import('../functions/lib/auth.js');
const qaAuth = { getUser: uid => auth.getUser(uid), createCustomToken: async uid => `synthetic-token-${uid}-${randomUUID()}` };
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log(`PASS ${name}`); };
async function fixture() {
  const uid = `email-${randomUUID()}`, email = `${uid}@example.test`;
  await auth.createUser({ uid, email });
  const sent = [];
  const send = async (address, code, deliveryId) => { sent.push({ address, code, deliveryId }); return true; };
  const start = () => request(db, qaAuth, send, uid, {});
  return { uid, email, sent, send, start };
}
try {
  await check('only authenticated owners can create; email comes from current Auth', async () => {
    const f = await fixture();
    await assert.rejects(request(db, qaAuth, f.send, null, {}), { code: 'unauthenticated' });
    await assert.rejects(request(db, qaAuth, f.send, f.uid, { expectedOwnerUid: 'another' }));
    const first = await request(db, qaAuth, f.send, f.uid, { email: 'wrong@example.test', expectedOwnerUid: f.uid });
    assert.equal(first.ownerUid, f.uid);
    assert.equal(f.sent[0].address, f.email); assert.match(f.sent[0].code, /^\d{6}$/);
    const row = (await db.doc(`auth_challenges/${first.challengeId}`).get()).data();
    assert.equal(Object.hasOwn(row, 'code_hash'), false); assert.equal(Object.hasOwn(row, 'email'), false);
    await assert.rejects(request(db, qaAuth, f.send, 'another', { challengeId: first.challengeId }));
    await auth.updateUser(f.uid, { disabled: true }); await assert.rejects(f.start());
  });
  await check('failed delivery never makes a code valid and malformed IDs/code fail', async () => {
    const f = await fixture(); let sentCode;
    await assert.rejects(request(db, qaAuth, async (_email, code) => { sentCode = code; return false; }, f.uid, {}), { code: 'unavailable' });
    const snap = await db.collection('_auth_email_challenges').where('owner_uid', '==', f.uid).get();
    const row = snap.docs[0]; assert.equal(row.data().status, 'failed'); assert.equal(Object.hasOwn(row.data(), 'code_hash'), false);
    await assert.rejects(verify(db, qaAuth, null, { challengeId: row.id, code: sentCode }));
    for (const challengeId of ['a/b', '', 'a'.repeat(161)]) await assert.rejects(request(db, qaAuth, f.send, f.uid, { challengeId }), { code: 'invalid-argument' });
    await assert.rejects(verify(db, qaAuth, null, { challengeId: row.id, code: '12345x' }), { code: 'invalid-argument' });
  });
  await check('resend retires the old code without resetting the attempt budget', async () => {
    const f = await fixture(), first = await f.start(), ref = db.doc(`_auth_email_challenges/${first.challengeId}`);
    const old = f.sent[0].code;
    const wrong = old === '000000' ? '999999' : '000000';
    await assert.rejects(verify(db, qaAuth, null, { challengeId: first.challengeId, code: wrong }), { code: 'permission-denied' });
    await request(db, qaAuth, f.send, null, { challengeId: first.challengeId });
    assert.equal((await ref.get()).data().attempts, 1);
    if (old !== f.sent[1].code) await assert.rejects(verify(db, qaAuth, null, { challengeId: first.challengeId, code: old }), { code: 'permission-denied' });
    const receipt = await verify(db, qaAuth, null, { challengeId: first.challengeId, code: f.sent[1].code });
    assert.match(receipt.customToken, /^synthetic-token-/); assert.equal((await ref.get()).data().status, 'consumed');
    assert.equal((await db.doc(`profiles/${f.uid}`).get()).exists, false);
    await assert.rejects(verify(db, qaAuth, null, { challengeId: first.challengeId, code: f.sent[1].code }));
    await assert.rejects(request(db, qaAuth, f.send, null, { challengeId: first.challengeId }));
  });
  await check('concurrent correct verifies produce one usable receipt', async () => {
    const f = await fixture(), first = await f.start();
    const results = await Promise.allSettled(Array.from({ length: 3 }, () => verify(db, qaAuth, null, { challengeId: first.challengeId, code: f.sent[0].code })));
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  });
  await check('wrong attempts are durable and sends share an account quota', async () => {
    const f = await fixture(), first = await f.start();
    await db.doc(`_auth_email_challenges/${first.challengeId}`).update({ attempts: 9 });
    const wrong = f.sent[0].code === '000000' ? '999999' : '000000';
    await assert.rejects(verify(db, qaAuth, null, { challengeId: first.challengeId, code: wrong }), { code: 'permission-denied' });
    await assert.rejects(verify(db, qaAuth, null, { challengeId: first.challengeId, code: f.sent[0].code }));
    await assert.rejects(request(db, qaAuth, f.send, null, { challengeId: first.challengeId }));
    for (let i = 0; i < 4; i++) await f.start();
    await assert.rejects(f.start(), { code: 'resource-exhausted' }); assert.equal(f.sent.length, 5);
  });
  await check('current email, account creation, expiry, caller and mode are checked', async () => {
    for (const change of ['email', 'created', 'expiry', 'caller', 'mode', 'denied']) {
      const f = await fixture(), first = await f.start(), pub = db.doc(`auth_challenges/${first.challengeId}`), secret = db.doc(`_auth_email_challenges/${first.challengeId}`);
      if (change === 'email') await auth.updateUser(f.uid, { email: `changed-${f.email}` });
      if (change === 'created') await secret.update({ auth_created_at: 'old-account' });
      if (change === 'expiry') await secret.update({ expires_at: Date.now() - 1 });
      if (change === 'mode') await pub.update({ channel: 'sms' });
      if (change === 'denied') await pub.update({ status: 'denied' });
      await assert.rejects(verify(db, qaAuth, change === 'caller' ? 'other' : null, { challengeId: first.challengeId, code: f.sent[0].code }));
    }
  });
  await check('late delivery cannot revive denial or a changed account', async () => {
    for (const change of ['denied', 'email']) {
      const f = await fixture();
      await assert.rejects(request(db, qaAuth, async () => {
        const records = await db.collection('auth_challenges').where('user_id', '==', f.uid).get();
        if (change === 'denied') await records.docs[0].ref.update({ status: 'denied' });
        else await auth.updateUser(f.uid, { email: `changed-${f.email}` });
        return true;
      }, f.uid, {}), { code: 'unavailable' });
      const records = await db.collection('_auth_email_challenges').where('owner_uid', '==', f.uid).get();
      assert.equal(records.docs[0].data().status, 'failed');
    }
  });
  await check('token mint races cannot approve a denied request or changed email', async () => {
    for (const change of ['denied', 'email', 'resend']) {
      const f = await fixture(), first = await f.start();
      const delayed = { ...qaAuth, createCustomToken: async uid => {
        if (change === 'email') await auth.updateUser(f.uid, { email: `changed-${f.email}` });
        else if (change === 'resend') await request(db, qaAuth, f.send, null, { challengeId: first.challengeId });
        else await db.doc(`auth_challenges/${first.challengeId}`).update({ status: 'denied' });
        return qaAuth.createCustomToken(uid);
      } };
      await assert.rejects(verify(db, delayed, null, { challengeId: first.challengeId, code: f.sent[0].code }));
    }
  });
  await check('legacy plaintext/hash rows are never proof; deliberate current approval switch works', async () => {
    const f = await fixture(), id = randomUUID(), ref = db.doc(`auth_challenges/${id}`);
    const base = { user_id: f.uid, status: 'pending', created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(), code_hash: '123456', code_salt: 'public', metadata: { code_hash: '123456', custom_token: 'old' } };
    await ref.set({ ...base, challenge_type: 'email_2fa' });
    await assert.rejects(request(db, qaAuth, f.send, null, { challengeId: id }));
    await assert.rejects(verify(db, qaAuth, null, { challengeId: id, code: '123456' }));
    await ref.set({ ...base, challenge_type: 'login_approval' });
    await assert.rejects(request(db, qaAuth, f.send, null, { challengeId: id }));
    await request(db, qaAuth, f.send, null, { challengeId: id }, { allowLoginSwitch: true });
    const row = (await ref.get()).data(); assert.equal(Object.hasOwn(row, 'code_hash'), false); assert.equal(Object.hasOwn(row.metadata, 'custom_token'), false);
    assert.equal((await verify(db, qaAuth, null, { challengeId: id, code: f.sent[0].code })).ok, true);
    assert.equal(Object.hasOwn((await ref.get()).data().metadata, 'custom_token'), false);
  });
  await check('provider HTTP failures and malformed success receipts never claim sent', async () => {
    const originalFetch = globalThis.fetch, savedKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = 'synthetic-local-test-only';
    try {
      for (const [status, payload] of [[401, {}], [429, {}], [500, {}], [200, {}], [200, { id: '' }], [200, { id: 'accepted-local-qa' }]]) {
        const f = await fixture();
        globalThis.fetch = async (url, options) => {
          if (String(url) !== 'https://api.resend.com/emails') return originalFetch(url, options);
          assert.match(options.headers['Idempotency-Key'], /^email-confirmation\/[a-f0-9]{48}$/);
          assert.ok(options.signal);
          return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
        };
        const result = auth2faRequest.run({ auth: { uid: f.uid, token: {} }, data: {} });
        if (payload.id) assert.equal((await result).ok, true); else await assert.rejects(result, { code: 'unavailable' });
        globalThis.fetch = originalFetch;
      }
    } finally { globalThis.fetch = originalFetch; if (savedKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = savedKey; }
  });
  await check('raw private proof and legacy public secrets are denied to every client', async () => {
    const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT, 'package.json'));
    const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
    const { doc, setDoc, getDoc, getDocs, collection } = require('firebase/firestore');
    const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
    const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
    try {
      await db.doc('auth_challenges/email-rules-ordinary').set({ user_id: 'email-rules-owner', challenge_type: 'login_approval', status: 'pending', metadata: {} });
      await db.doc('auth_challenges/email-rules-secret').set({ user_id: 'email-rules-owner', challenge_type: 'login_approval', code_hash: 'legacy-secret', metadata: {} });
      await db.doc('auth_challenges/email-rules-token').set({ user_id: 'email-rules-owner', challenge_type: 'login_approval', metadata: { custom_token: 'secret' } });
      await db.doc('auth_challenges/email-rules-email').set({ user_id: 'email-rules-owner', challenge_type: 'email_2fa', metadata: {} });
      for (const name of ['_auth_email_challenges', '_auth_email_limits']) await db.doc(`${name}/email-rules-owner`).set({ owner_uid: 'email-rules-owner' });
      for (const ctx of [env.authenticatedContext('email-rules-owner'), env.authenticatedContext('other'), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
        for (const name of ['_auth_email_challenges', '_auth_email_limits']) {
          await assertFails(getDoc(doc(ctx.firestore(), name, 'email-rules-owner')));
          await assertFails(getDocs(collection(ctx.firestore(), name)));
          await assertFails(setDoc(doc(ctx.firestore(), name, 'new'), { owner_uid: 'email-rules-owner' }));
        }
        for (const id of ['email-rules-secret', 'email-rules-token', 'email-rules-email']) await assertFails(getDoc(doc(ctx.firestore(), 'auth_challenges', id)));
      }
      await assertSucceeds(getDoc(doc(env.authenticatedContext('email-rules-owner').firestore(), 'auth_challenges', 'email-rules-ordinary')));
      await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), 'auth_challenges', 'email-rules-ordinary')));
    } finally { await env.cleanup(); }
  });
  console.log(`Email challenge backend/rules: ${checks} groups passed. No real email sent.`);
} finally { await db.terminate(); }
