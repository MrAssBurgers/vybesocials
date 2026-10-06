import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-parental-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:9494');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9497');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve('../qa-tools/package.json'));
const { initializeTestEnvironment, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc } = require('firebase/firestore');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const api = await import('../functions/lib/parental.js');
const env = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT, firestore: {
  host: '127.0.0.1', port: 9494, rules: await readFile('releases/people-discovery-20261006/firestore.rules', 'utf8'),
} });
let checks = 0, ruleChecks = 0;
const check = async (name, run) => { await run(); checks++; console.log('PASS ' + name); };
const uid = 'parental-qa-alice', ref = db.doc(`parental_controls/${uid}`);
const profileId = 'parental-qa-profile', revision = 'a'.repeat(48);
let created, authTime;
const request = data => ({ auth: { uid, token: { auth_time: authTime } }, data: { expectedOwnerUid: uid, expectedProfileId: profileId, expectedAccountCreatedAt: created, ...data } });
const setupId = '11111111-1111-4111-8111-111111111111';
const pinRequest = data => request({ requestId: setupId, ...data });
const clearReceipts = async () => { const owned = await db.collection('_parental_pin_receipts').where('owner_uid', '==', uid).get(); await Promise.all(owned.docs.map(doc => doc.ref.delete())); };
const salt = '0123456789abcdef0123456789abcdef';
const seed = async (extra = {}) => { await clearReceipts(); return ref.set({ user_id: uid, authority_version: 1, profile_id: profileId, auth_created_at_ms: created, binding_revision: revision, is_active: true, content_filter_level: 'protected',
  max_screen_time_minutes: 120, allowed_features: ['feed', 'profile'], created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  pin_salt: salt, pin_hash: createHash('sha256').update(`${salt}:1234`).digest('hex'), pin_algo: 'sha256-v1', ...extra }); };
try {
  await env.clearFirestore(); try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  const user = await auth.createUser({ uid }); created = Date.parse(user.metadata.creationTime); authTime = Math.floor(Date.now() / 1000);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid });
  await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, owner_uid: uid, profile_id: profileId, auth_created_at_ms: created, revision, status: 'active' });
  await check('all four actual handlers reject unauthenticated requests', async () => {
    for (const name of ['setParentalPin', 'verifyParentalPin', 'getParentalControlsSafe', 'updateParentalControls']) await assert.rejects(api[name].run({ data: {} }), { code: 'unauthenticated' });
  });
  await check('first setup returns only safe controls and a working derived PIN', async () => {
    const result = await api.setParentalPin.run(pinRequest({ pin: '1234' }));
    assert.equal(result.controls.has_pin, true); assert.equal(result.controls.is_active, true);
    assert.doesNotMatch(JSON.stringify(result), /pin_hash|pin_salt|pin_failures|pin_lock_until/);
    assert.equal((await ref.get()).data().pin_algo, 'scrypt-v2');
    assert.equal((await api.verifyParentalPin.run(request({ pin: '1234' }))).ok, true);
  });
  await check('legacy PIN cannot be reset without current proof or changed with wrong proof', async () => {
    await seed(); const old = (await ref.get()).data().pin_hash;
    await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '5678' })), { code: 'permission-denied' });
    await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '5678', currentPin: '9999' })), { code: 'permission-denied' });
    assert.equal((await ref.get()).data().pin_hash, old);
  });
  await check('settings cannot be disabled by calling the endpoint without the PIN', async () => {
    await seed(); await assert.rejects(api.updateParentalControls.run(request({ updates: { is_active: false } })), { code: 'permission-denied' });
    assert.equal((await ref.get()).data().is_active, true);
  });
  await check('valid legacy proof rotates to the new derivation and preserves settings/history', async () => {
    await seed(); await api.setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }));
    const row = (await ref.get()).data(); assert.equal(row.pin_algo, 'scrypt-v2'); assert.equal(row.created_at, '2026-01-01T00:00:00.000Z'); assert.equal(row.max_screen_time_minutes, 120);
    assert.equal((await api.verifyParentalPin.run(request({ pin: '5678' }))).ok, true);
    await api.updateParentalControls.run(request({ pin: '5678', updates: { max_screen_time_minutes: 60 } }));
    assert.equal((await ref.get()).data().max_screen_time_minutes, 60);
  });
  await check('unknown/secret fields and malformed settings cause no writes', async () => {
    await seed(); const original = (await ref.get()).data();
    for (const updates of [{ user_id: 'other' }, { pin_salt: 'injected' }, { private_note: true }, { is_active: 'false' }, { max_screen_time_minutes: -1 }]) {
      await assert.rejects(api.updateParentalControls.run(request({ pin: '1234', updates })), { code: 'invalid-argument' });
      assert.deepEqual((await ref.get()).data(), original);
    }
  });
  await check('account mismatch fails before counter or settings mutation', async () => {
    await seed(); const original = (await ref.get()).data();
    await assert.rejects(api.updateParentalControls.run(request({ expectedOwnerUid: 'other', pin: '1234', updates: { is_active: false } })), { code: 'failed-precondition' });
    assert.deepEqual((await ref.get()).data(), original);
  });
  await check('real competing Firestore transactions retain five failures and a shared lockout', async () => {
    await seed(); const results = await Promise.all(Array.from({ length: 5 }, () => api.verifyParentalPin.run(request({ pin: '9999' }))));
    assert.ok(results.every(result => !result.ok)); assert.equal((await ref.get()).data().pin_failures, 5);
    await assert.rejects(api.verifyParentalPin.run(request({ pin: '1234' })), { code: 'resource-exhausted' });
    await assert.rejects(api.updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } })), { code: 'resource-exhausted' });
    assert.equal((await ref.get()).data().is_active, true);
  });
  await check('expired lock permits correct proof and resets failure state', async () => {
    await seed({ pin_failures: 5, pin_lock_until: Date.now() - 1000 });
    assert.equal((await api.verifyParentalPin.run(request({ pin: '1234' }))).ok, true);
    assert.equal((await ref.get()).data().pin_failures, 0); assert.equal((await ref.get()).data().pin_lock_until, 0);
  });
  await check('safe read does not expose unknown server fields or PIN material', async () => {
    await seed({ private_note: 'keep-private', pin_failures: 2, pin_lock_until: 0 });
    assert.doesNotMatch(JSON.stringify(await api.getParentalControlsSafe.run(request({}))), /private_note|pin_hash|pin_salt|pin_failures|pin_lock_until/);
  });
  await check('disabled current Auth blocks reads and writes without changing controls', async () => {
    await seed(); const original = (await ref.get()).data(); await auth.updateUser(uid, { disabled: true });
    await assert.rejects(api.getParentalControlsSafe.run(request({})), { code: 'failed-precondition' });
    await assert.rejects(api.updateParentalControls.run(request({ pin: '1234', updates: { is_active: false } })), { code: 'failed-precondition' });
    assert.deepEqual((await ref.get()).data(), original); await auth.updateUser(uid, { disabled: false });
  });
  await check('protected profile binding retirement blocks control changes', async () => {
    await seed(); const original = (await ref.get()).data(); await db.doc(`_account_profile_bindings/${uid}`).update({ status: 'retired' });
    await assert.rejects(api.verifyParentalPin.run(request({ pin: '1234' })), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), original);
    await db.doc(`_account_profile_bindings/${uid}`).update({ status: 'active' });
  });
  await check('duplicate canonical profiles are rejected without PIN changes', async () => {
    await seed(); const original = (await ref.get()).data(); await db.doc('profiles/duplicate').set({ user_id: uid });
    await assert.rejects(api.getParentalControlsSafe.run(request({})), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), original); await db.doc('profiles/duplicate').delete();
  });
  await check('unbound legacy and older account controls are preserved for review', async () => {
    await seed({ authority_version: 0 }); const original = (await ref.get()).data();
    await assert.rejects(api.verifyParentalPin.run(request({ pin: '1234' })), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), original);
    await seed({ auth_created_at_ms: created - 10000 }); const retired = (await ref.get()).data();
    await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' })), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), retired);
  });
  await check('historical alias PIN record prevents a second setup', async () => {
    await ref.delete(); await db.doc(`parental_controls/${profileId}`).set({ user_id: profileId, pin_hash: 'legacy' });
    await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '1234' })), { code: 'failed-precondition' }); assert.equal((await ref.get()).exists, false);
    await db.doc(`parental_controls/${profileId}`).delete(); await seed();
  });
  await check('concurrent identical first setup creates one PIN and a durable replay receipt', async () => {
    await ref.delete(); await clearReceipts(); const call = pinRequest({ pin: '5678', settings: { max_screen_time_minutes: 90 } });
    const results = await Promise.all([api.setParentalPin.run(call), api.setParentalPin.run(call)]);
    assert.equal(results.filter(result => result.replayed === false).length, 1); assert.equal(results.filter(result => result.replayed === true).length, 1);
    const saved = (await ref.get()).data(); assert.equal(saved.pin_failures, 0); const replay = await api.setParentalPin.run(call); assert.equal(replay.replayed, true); assert.deepEqual((await ref.get()).data(), saved);
  });
  await check('altered setup details and later control changes cannot overwrite a saved setup', async () => {
    await seed(); const call = pinRequest({ pin: '5678', currentPin: '1234' }); await api.setParentalPin.run(call); const saved = (await ref.get()).data();
    await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '5678', settings: { max_screen_time_minutes: 30 } })), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), saved);
    await api.updateParentalControls.run(request({ pin: '5678', updates: { max_screen_time_minutes: 30 } })); const updated = (await ref.get()).data();
    await assert.rejects(api.setParentalPin.run(call), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), updated);
  });
  await check('receipt retry guesses share the existing five-attempt lockout', async () => {
    await seed(); await api.setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }));
    for (let i = 0; i < 5; i++) await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '9999' })), { code: 'permission-denied' });
    assert.equal((await ref.get()).data().pin_failures, 5); await assert.rejects(api.setParentalPin.run(pinRequest({ pin: '5678' })), { code: 'resource-exhausted' });
    await seed();
  });
  await check('deployed Rules deny raw PIN reads and writes for owner and another user', async () => {
    for (const actor of [uid, 'parental-qa-other']) {
      const clientRef = doc(env.authenticatedContext(actor).firestore(), `parental_controls/${uid}`);
      for (const operation of [() => getDoc(clientRef), () => setDoc(clientRef, { user_id: actor, pin_hash: 'forged' }), () => updateDoc(clientRef, { pin_failures: 0 })]) {
        await assertFails(operation()); ruleChecks++;
      }
    }
  });
  await check('deployed Rules deny raw receipt reads and writes for owner and another user', async () => {
    await api.setParentalPin.run(pinRequest({ pin: '5678', currentPin: '1234' }));
    const receiptId = createHash('sha256').update(JSON.stringify([uid, profileId, created, setupId])).digest('hex'); assert.ok((await db.doc(`_parental_pin_receipts/${receiptId}`).get()).exists);
    for (const actor of [uid, 'parental-qa-other']) {
      const clientRef = doc(env.authenticatedContext(actor).firestore(), `_parental_pin_receipts/${receiptId}`);
      for (const operation of [() => getDoc(clientRef), () => setDoc(clientRef, { owner_uid: actor, fingerprint: 'forged' }), () => updateDoc(clientRef, { result_revision: 'forged' })]) { await assertFails(operation()); ruleChecks++; }
    }
  });
  await check('actual Auth revocation rejects old credentials without changing the PIN', async () => {
    await seed(); const original = (await ref.get()).data(); await auth.revokeRefreshTokens(uid);
    const cutoff = Date.parse((await auth.getUser(uid)).tokensValidAfterTime); assert.ok(cutoff > authTime * 1000);
    await assert.rejects(api.verifyParentalPin.run(request({ pin: '1234' })), { code: 'unauthenticated' }); assert.deepEqual((await ref.get()).data(), original);
  });
  await check('actual same-UID Auth recreation cannot inherit old bound controls', async () => {
    const original = (await ref.get()).data(); await auth.deleteUser(uid); const replacement = await auth.createUser({ uid });
    const replacementCreated = Date.parse(replacement.metadata.creationTime); assert.notEqual(replacementCreated, created);
    await assert.rejects(api.getParentalControlsSafe.run(request({})), { code: 'failed-precondition' });
    await assert.rejects(api.verifyParentalPin.run(request({ pin: '1234', expectedAccountCreatedAt: replacementCreated })), { code: 'unauthenticated' });
    const fresh = { ...request({ pin: '1234', expectedAccountCreatedAt: replacementCreated }), auth: { uid, token: { auth_time: Math.floor(Date.now() / 1000) } } };
    await assert.rejects(api.verifyParentalPin.run(fresh), { code: 'failed-precondition' }); assert.deepEqual((await ref.get()).data(), original);
  });
  console.log(JSON.stringify({ groupedChecks: checks, rulesChecks: ruleChecks, project: process.env.GCLOUD_PROJECT, actualCompiledHandlers: true,
    productionWrites: false, actualAuthLifecycleCases: true, setupReceiptReplayCases: true, verifiedHttpAuthenticationAdmission: false, fullRestrictionEnforcementCertified: false }));
} finally { await env.cleanup(); }
