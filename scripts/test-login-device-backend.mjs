import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-login-device-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9297');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT, 'package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const { ensureAccountProfileForUid } = await import('../functions/lib/_shared/accountProfileAuthority.js');
const { registerLoginDevice: register, withCurrentLoginDevice, loginDeviceHeadId, loginDeviceVersion } = await import('../functions/lib/_shared/loginDeviceAuthority.js');
const { runAuthLoginNotify } = await import('../functions/lib/auth.js');
const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile(process.env.FIRESTORE_RULES_FILE || 'firestore.rules', 'utf8') } });
let groups = 0, rules = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
async function fixture(setup = true) {
  const uid = `device-${randomUUID()}`, user = await auth.createUser({ uid }), created = Date.parse(user.metadata.creationTime);
  if (setup) await ensureAccountProfileForUid(db, auth, uid, { action: 'ensure', expectedOwnerUid: uid, expectedAccountCreatedAt: created, requestId: randomUUID() });
  const at = Math.floor(Date.now() / 1000) + 30, fingerprint = randomUUID(), now = (at + 90) * 1000;
  const input = (authTime = at, method = 'password') => ({ expectedOwnerUid: uid, expectedAccountCreatedAt: created, expectedAuthTime: authTime, method, deviceFingerprint: fingerprint });
  return { uid, created, at, fingerprint, now, input, run: (time = at, method = 'password', authority = auth) => register(db, authority, uid, time, input(time, method), {}, now) };
}
try {
  await env.clearFirestore();
  await check('canonical registration is bound to verified token time and exact account incarnation', async () => {
    const f = await fixture();
    for (const patch of [{ expectedOwnerUid: 'other' }, { expectedAuthTime: f.at + 1 }, { expectedAccountCreatedAt: f.created + 1 }]) await assert.rejects(register(db, auth, f.uid, f.at, { ...f.input(), ...patch }, {}, f.now));
    const result = await f.run(); assert.equal(result.ownerUid, f.uid); assert.equal(result.profileId, f.uid); assert.equal(result.trackingDeferred, false);
    assert.equal(result.authTime, f.at); assert.ok(result.sessionId.startsWith('device-'));
  });
  await check('concurrent registration and lost replies reuse one generation', async () => {
    const f = await fixture(), results = await Promise.all([f.run(), f.run()]);
    assert.equal(results[0].sessionId, results[1].sessionId); assert.equal(results.filter(row => row.created).length, 1);
    assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).size, 1);
    assert.equal((await f.run()).sessionId, results[0].sessionId);
  });
  await check('old credentials and resume cannot clear revoked state; fresh credentials create a new generation', async () => {
    const f = await fixture(), before = await f.run(), revokedAt = new Date((f.at + 10) * 1000).toISOString();
    await db.doc(`user_sessions/${before.sessionId}`).update({ revoked_at: revokedAt, trusted: false });
    await assert.rejects(f.run(), { code: 'unauthenticated' });
    await assert.rejects(f.run(f.at + 10), { code: 'unauthenticated' });
    await assert.rejects(f.run(f.at + 11, 'session_resume'), { code: 'unauthenticated' });
    const fresh = await f.run(f.at + 11); assert.notEqual(fresh.sessionId, before.sessionId);
    assert.equal((await db.doc(`user_sessions/${before.sessionId}`).get()).data().revoked_at, revokedAt);
    assert.equal((await f.run(f.at + 11)).sessionId, fresh.sessionId);
    await assert.rejects(f.run(f.at + 11, 'session_resume'), { code: 'failed-precondition' });
    await withCurrentLoginDevice(db, auth, fresh, f.fingerprint, (tx, ref) => tx.update(ref, { trusted: true }), f.now);
    assert.equal((await f.run(f.at + 11, 'session_resume')).sessionId, fresh.sessionId);
  });
  await check('new protected pointer reaches current generation even with more than 200 old records', async () => {
    const f = await fixture(), first = await f.run(), batch = db.batch();
    for (let index = 0; index < 205; index++) batch.set(db.doc(`user_sessions/history-${randomUUID()}`), { user_id: f.uid, session_token_hash: f.fingerprint, created_at: new Date().toISOString(), revoked_at: new Date().toISOString() });
    await batch.commit(); assert.equal((await f.run()).sessionId, first.sessionId);
    const old = await fixture(); const many = db.batch();
    for (let index = 0; index < 201; index++) many.set(db.doc(`user_sessions/history-${randomUUID()}`), { user_id: old.uid, session_token_hash: old.fingerprint, created_at: new Date().toISOString(), revoked_at: null });
    await many.commit(); await assert.rejects(old.run(), { code: 'resource-exhausted' });
  });
  await check('an arbitrary newer legacy row never hides an older revocation cutoff', async () => {
    const f = await fixture(), older = db.doc(`user_sessions/old-${randomUUID()}`), newer = db.doc(`user_sessions/new-${randomUUID()}`);
    await older.set({ user_id: f.uid, session_token_hash: f.fingerprint, created_at: new Date((f.at - 5) * 1000).toISOString(), revoked_at: new Date((f.at + 10) * 1000).toISOString() });
    await newer.set({ user_id: f.uid, session_token_hash: f.fingerprint, created_at: new Date((f.at + 12) * 1000).toISOString(), revoked_at: null });
    await assert.rejects(f.run(), { code: 'unauthenticated' });
    const next = await f.run(f.at + 13); assert.notEqual(next.sessionId, newer.id); assert.equal(next.created, true);
  });
  await check('profile setup deferral is limited to new accounts without any security or identity state', async () => {
    const fresh = await fixture(false), deferred = await fresh.run();
    assert.equal(deferred.trackingDeferred, true); assert.equal(deferred.sessionId, null); assert.equal(deferred.profileId, null);
    assert.equal((await db.collection('user_sessions').where('user_id', '==', fresh.uid).get()).empty, true);
    for (const state of ['settings', 'challenge', 'session', 'index', 'foreign-profile']) {
      const f = await fixture(false);
      if (state === 'settings') await db.doc(`user_2fa_settings/${f.uid}`).set({ login_approvals_enabled: true });
      if (state === 'challenge') await db.doc(`auth_challenges/${randomUUID()}`).set({ user_id: f.uid, status: 'pending' });
      if (state === 'session') await db.doc(`user_sessions/${randomUUID()}`).set({ user_id: f.uid });
      if (state === 'index') await db.doc(`user_auth_index/${f.uid}`).set({ profile_id: 'foreign' });
      if (state === 'foreign-profile') await db.doc(`profiles/${f.uid}`).set({ user_id: 'foreign', username: 'foreign' });
      await assert.rejects(f.run(), { code: 'failed-precondition' });
    }
  });
  await check('current and delayed Auth revocation, disabled account and incarnation change reject registration', async () => {
    const f = await fixture(), record = await auth.getUser(f.uid);
    for (const patch of [{ disabled: true }, { metadata: { ...record.metadata, creationTime: new Date(f.created + 1000).toISOString() } }, { tokensValidAfterTime: new Date((f.at + 1) * 1000).toISOString() }]) {
      await assert.rejects(f.run(f.at, 'password', { getUser: async () => ({ ...record, ...patch }) }), { code: 'unauthenticated' });
    }
    let calls = 0;
    await assert.rejects(f.run(f.at, 'password', { getUser: async () => ({ ...record, disabled: ++calls > 1 }) }), { code: 'unauthenticated' });
    assert.equal((await db.collection('user_sessions').where('user_id', '==', f.uid).get()).empty, true);
    await assert.rejects(f.run(f.at, 'password', { getUser: async () => { throw new Error('offline'); } }), { code: 'unavailable' });
  });
  await check('previous-incarnation history cannot become the recreated account’s trusted device', async () => {
    const f = await fixture(), oldRef = db.doc(`user_sessions/previous-${randomUUID()}`);
    await oldRef.set({ user_id: f.uid, profile_id: f.uid, session_token_hash: f.fingerprint, account_created_at_ms: f.created - 10000, created_at: new Date(f.created - 9000).toISOString(), trusted: true, revoked_at: null });
    const registered = await f.run(); assert.notEqual(registered.sessionId, oldRef.id); assert.equal(registered.created, true); assert.equal(registered.row.trusted, false);
    const legacy = await fixture(), legacyRef = db.doc(`user_sessions/legacy-incarnation-${randomUUID()}`);
    await legacyRef.set({ user_id: legacy.uid, session_token_hash: legacy.fingerprint, created_at: new Date(legacy.created - 9000).toISOString(), trusted: true, revoked_at: null });
    assert.notEqual((await legacy.run()).sessionId, legacyRef.id);
  });
  await check('later trust updates and receipts reject revoked, replaced and deleted session generations', async () => {
    for (const mode of ['revoked', 'deleted', 'recreated']) {
      const f = await fixture(), registered = await f.run(), ref = db.doc(`user_sessions/${registered.sessionId}`), stored = (await ref.get()).data();
      if (mode === 'revoked') await ref.update({ revoked_at: new Date((f.at + 1) * 1000).toISOString() });
      else { await ref.delete(); if (mode === 'recreated') await ref.set(stored); }
      await assert.rejects(withCurrentLoginDevice(db, auth, registered, f.fingerprint, (tx, live) => tx.update(live, { trusted: true }), f.now), { code: 'unauthenticated' });
      if (mode === 'deleted') assert.equal((await ref.get()).exists, false);
      else assert.equal((await ref.get()).data().trusted, false);
    }
  });
  await check('actual notify handler preserves approval gates and concurrent resume cannot trust a pending device', async () => {
    const f = await fixture(), at = Math.floor(Date.now() / 1000), providers = { geo: async () => ({ ip: null }), send: async () => ({ ok: true }) };
    const request = method => ({ auth: { uid: f.uid, token: { auth_time: at } }, data: f.input(at, method), rawRequest: { ip: '127.0.0.1' } });
    await db.doc(`user_sessions/other-${randomUUID()}`).set({ user_id: f.uid, created_at: new Date().toISOString(), trusted: true, revoked_at: null });
    await db.doc(`user_2fa_settings/${f.uid}`).set({ login_approvals_enabled: true });
    await assert.rejects(runAuthLoginNotify(request('session_resume'), providers), { code: 'failed-precondition' });
    const pending = await runAuthLoginNotify(request('password'), providers);
    assert.equal(pending.requiresApproval, true); assert.ok(pending.challengeId); assert.equal(pending.authTime, at);
    await assert.rejects(runAuthLoginNotify(request('session_resume'), providers), { code: 'failed-precondition' });
    assert.equal((await db.doc(`user_sessions/${pending.sessionId}`).get()).data().trusted, false);
    assert.equal((await db.doc(`user_sessions/${pending.sessionId}`).get()).data().pending_approval, true);
    const retry = await runAuthLoginNotify(request('password'), providers); assert.equal(retry.challengeId, pending.challengeId); assert.equal(retry.requiresApproval, true);
    const oldChallenge = db.doc(`auth_challenges/${pending.challengeId}`);
    await oldChallenge.update({ expires_at: new Date(Date.now() - 1000).toISOString() });
    const retained = (await oldChallenge.get()).data();
    const renewed = await runAuthLoginNotify(request('password'), providers);
    assert.notEqual(renewed.challengeId, pending.challengeId); assert.equal(renewed.requiresApproval, true);
    assert.ok(Date.parse(renewed.expiresAt) > Date.now()); assert.deepEqual((await oldChallenge.get()).data(), retained);
    assert.equal((await runAuthLoginNotify(request('password'), providers)).challengeId, renewed.challengeId);
    await assert.rejects(runAuthLoginNotify(request('login_approval_enable'), providers), { code: 'invalid-argument' });
  });
  await check('an interrupted first-device registration can finish without a false pending transition', async () => {
    const f = await fixture(), at = Math.floor(Date.now() / 1000), input = f.input(at);
    const registered = await register(db, auth, f.uid, at, input);
    assert.equal(registered.row.trusted, false); assert.equal(registered.row.pending_approval, false);
    const request = { auth: { uid: f.uid, token: { auth_time: at } }, data: input, rawRequest: { ip: '127.0.0.1' } };
    const result = await runAuthLoginNotify(request, { geo: async () => ({ ip: null }), send: async () => { throw new Error('No provider should be called'); } });
    assert.equal(result.requiresApproval, false); assert.equal(result.reason, 'first_device'); assert.equal(result.sessionId, registered.sessionId);
    assert.equal((await db.doc(`user_sessions/${result.sessionId}`).get()).data().trusted, true);
  });
  await check('actual handler cannot grant trust from settings captured before a delayed request', async () => {
    const f = await fixture(), at = Math.floor(Date.now() / 1000), settings = db.doc(`user_2fa_settings/${f.uid}`);
    await settings.set({ login_approvals_enabled: false });
    await db.doc(`user_sessions/other-${randomUUID()}`).set({ user_id: f.uid, created_at: new Date().toISOString(), trusted: true, revoked_at: null });
    const request = { auth: { uid: f.uid, token: { auth_time: at } }, data: f.input(at), rawRequest: { ip: '127.0.0.1' } };
    await assert.rejects(runAuthLoginNotify(request, { geo: async () => { await settings.update({ login_approvals_enabled: true }); return { ip: null }; }, send: async () => { throw new Error('No provider should be called'); } }), { code: 'aborted' });
    const sessions = await db.collection('user_sessions').where('user_id', '==', f.uid).where('session_token_hash', '==', f.fingerprint).get();
    assert.equal(sessions.size, 1); assert.equal(sessions.docs[0].data().trusted, false);
    const retry = await runAuthLoginNotify(request, { geo: async () => ({ ip: null }), send: async () => ({ ok: true }) });
    assert.equal(retry.requiresApproval, true); assert.ok(Date.parse(retry.expiresAt) > Date.now());
  });
  await check('final trusted receipts and trust writes reject a concurrently pending generation', async () => {
    const f = await fixture(), settings = db.doc(`user_2fa_settings/${f.uid}`);
    await settings.set({ login_approvals_enabled: false }); const settingsSnapshot = await settings.get();
    const registered = await f.run(), session = db.doc(`user_sessions/${registered.sessionId}`);
    await session.update({ trusted: false, pending_approval: true });
    await assert.rejects(withCurrentLoginDevice(db, auth, registered, f.fingerprint, () => ({ requiresApproval: false }), f.now, { confirmation: 'trusted' }), { code: 'aborted' });
    await assert.rejects(withCurrentLoginDevice(db, auth, registered, f.fingerprint, (tx, ref) => tx.update(ref, { trusted: true, pending_approval: false }), f.now, { trust: 'approvals-disabled', settingsVersion: loginDeviceVersion(settingsSnapshot.updateTime) }), { code: 'aborted' });
    assert.equal((await session.get()).data().pending_approval, true);
  });
  await check('actual fresh sign-in after revocation replaces the generation and then resumes normally', async () => {
    const f = await fixture(), providers = { geo: async () => ({ ip: null }), send: async () => { throw new Error('No provider should be called'); } };
    const request = (at, method = 'password') => ({ auth: { uid: f.uid, token: { auth_time: at } }, data: f.input(at, method), rawRequest: { ip: '127.0.0.1' } });
    const oldAt = Math.floor(Date.now() / 1000), before = await runAuthLoginNotify(request(oldAt), providers);
    const revokedAt = Date.now(), oldRef = db.doc(`user_sessions/${before.sessionId}`);
    await oldRef.update({ revoked_at: new Date(revokedAt).toISOString(), trusted: false });
    const retained = (await oldRef.get()).data();
    await assert.rejects(runAuthLoginNotify(request(oldAt), providers), { code: 'unauthenticated' });
    await new Promise(resolve => setTimeout(resolve, 1100 - (Date.now() % 1000)));
    const newAt = Math.floor(Date.now() / 1000);
    await assert.rejects(runAuthLoginNotify(request(newAt, 'session_resume'), providers), { code: 'unauthenticated' });
    const fresh = await runAuthLoginNotify(request(newAt), providers);
    assert.notEqual(fresh.sessionId, before.sessionId); assert.equal(fresh.requiresApproval, false);
    assert.deepEqual((await oldRef.get()).data(), retained);
    const resumed = await runAuthLoginNotify(request(newAt, 'session_resume'), providers);
    assert.equal(resumed.sessionId, fresh.sessionId); assert.equal(resumed.requiresApproval, false);
  });
  await check('retired binding and corrupt protected head never select another user or recreate missing sessions', async () => {
    const f = await fixture(), before = await f.run(), head = db.doc(`_auth_device_session_heads/${loginDeviceHeadId(f.uid, f.created, f.fingerprint)}`);
    await head.update({ owner_uid: 'other' }); await assert.rejects(f.run(), { code: 'failed-precondition' });
    await head.update({ owner_uid: f.uid }); await db.doc(`user_sessions/${before.sessionId}`).delete(); await assert.rejects(f.run(), { code: 'failed-precondition' });
    const next = await fixture(); await db.doc(`_account_profile_bindings/${next.uid}`).update({ status: 'retired' }); await assert.rejects(next.run(), { code: 'failed-precondition' });
  });
  await check('fresh sign-in never reuses the revoked generation’s still-pending approval challenge', async () => {
    const f = await fixture(), providers = { geo: async () => ({ ip: null }), send: async () => ({ ok: true }) };
    const request = at => ({ auth: { uid: f.uid, token: { auth_time: at } }, data: f.input(at), rawRequest: { ip: '127.0.0.1' } });
    await db.doc(`user_2fa_settings/${f.uid}`).set({ login_approvals_enabled: true });
    await db.doc(`user_sessions/other-${randomUUID()}`).set({ user_id: f.uid, created_at: new Date().toISOString(), trusted: true, revoked_at: null });
    const before = await runAuthLoginNotify(request(Math.floor(Date.now() / 1000)), providers);
    assert.equal(before.requiresApproval, true);
    const oldRef = db.doc(`user_sessions/${before.sessionId}`), oldChallenge = db.doc(`auth_challenges/${before.challengeId}`);
    await oldRef.update({ revoked_at: new Date().toISOString(), trusted: false });
    const retained = (await oldRef.get()).data(), retainedChallenge = (await oldChallenge.get()).data();
    await new Promise(resolve => setTimeout(resolve, 1100 - (Date.now() % 1000)));
    const at = Math.floor(Date.now() / 1000), fresh = await runAuthLoginNotify(request(at), providers);
    assert.notEqual(fresh.sessionId, before.sessionId); assert.notEqual(fresh.challengeId, before.challengeId);
    assert.equal(fresh.requiresApproval, true);
    assert.equal((await db.doc(`auth_challenges/${fresh.challengeId}`).get()).data().metadata.requesting_session_id, fresh.sessionId);
    assert.deepEqual((await oldRef.get()).data(), retained); assert.deepEqual((await oldChallenge.get()).data(), retainedChallenge);
    assert.equal((await runAuthLoginNotify(request(at), providers)).challengeId, fresh.challengeId);
  });
  await check('direct protected head access stays denied for owner, stranger, staff and anonymous clients', async () => {
    const owner = await fixture(), row = await owner.run(), id = loginDeviceHeadId(owner.uid, owner.created, owner.fingerprint);
    assert.ok(row.sessionId);
    for (const viewer of [env.authenticatedContext(owner.uid), env.authenticatedContext('stranger'), env.authenticatedContext('staff', { admin: true }), env.unauthenticatedContext()]) {
      const client = viewer.firestore(), ref = doc(client, '_auth_device_session_heads', id);
      for (const action of [() => getDoc(ref), () => getDocs(collection(client, '_auth_device_session_heads')), () => setDoc(doc(client, '_auth_device_session_heads', 'new'), {}), () => updateDoc(ref, { owner_uid: 'other' }), () => deleteDoc(ref)]) { await assertFails(action()); rules++; }
    }
  });
  console.log(`PASS ${groups} login device backend groups + ${rules} Rules checks`);
} finally { await env.cleanup(); }
