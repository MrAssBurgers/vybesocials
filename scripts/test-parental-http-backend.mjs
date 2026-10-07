import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

// Never run this synthetic-account harness against production.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-parental-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:9494');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9497');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: process.env.GCLOUD_PROJECT });
const require = createRequire(path.resolve('functions/package.json'));
const express = require('express');
const { db, auth } = await import('../functions/lib/_shared/admin.js');
const api = await import('../functions/lib/parental.js');
const names = ['setParentalPin', 'verifyParentalPin', 'getParentalControlsSafe', 'updateParentalControls', 'updateSafetySettings'];
const app = express();
app.use(express.json());
// Invoke the SDK's actual HTTP wrapper, never .run or an injected auth context.
for (const name of names) app.post(`/${name}`, api[name]);
const server = await new Promise((resolve, reject) => {
  const listener = app.listen(9599, '127.0.0.1', () => resolve(listener));
  listener.on('error', reject);
});
const base = 'http://127.0.0.1:9599';
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
async function call(name, data, token, envelope = { data }) {
  const response = await fetch(`${base}/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(envelope), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json() };
}
const expectError = (response, status, code) => {
  assert.equal(response.status, status); assert.equal(response.body.error?.status, code);
  assert.equal(response.body.result, undefined);
};
const users = [];
async function createActor(label) {
  const uid = `parental-http-${label}`, profileId = `${uid}-profile`;
  try { await auth.deleteUser(uid); } catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  const email = `${uid}@example.test`, password = `Synthetic-${randomUUID()}`;
  const user = await auth.createUser({ uid, email, password }); users.push(uid);
  const created = Date.parse(user.metadata.creationTime);
  await db.doc(`profiles/${profileId}`).set({ user_id: uid });
  await db.doc(`_account_profile_bindings/${uid}`).set({ version: 1, owner_uid: uid, profile_id: profileId,
    auth_created_at_ms: created, revision: 'a'.repeat(48), status: 'active' });
  const response = await fetch('http://127.0.0.1:9497/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  const session = await response.json(); assert.equal(session.localId, uid); assert.ok(session.idToken);
  return { uid, profileId, token: session.idToken, scope: { expectedOwnerUid: uid, expectedProfileId: profileId, expectedAccountCreatedAt: created } };
}
try {
  // Only the explicitly guarded demo database is cleared.
  const clear = await fetch('http://127.0.0.1:9494/emulator/v1/projects/demo-vybe-parental-qa/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(clear.status, 200);
  const alice = await createActor('alice'), bob = await createActor('bob');
  const ref = db.doc(`parental_controls/${alice.uid}`);
  await check('all five HTTP entry points require authentication', async () => {
    for (const name of names) expectError(await call(name, alice.scope), 401, 'UNAUTHENTICATED');
    assert.equal((await ref.get()).exists, false);
  });
  await check('SDK rejects a malformed bearer token before dispatch', async () => {
    expectError(await call('setParentalPin', { ...alice.scope, pin: '1234', requestId: randomUUID() }, 'invalid-token'), 401, 'UNAUTHENTICATED');
    assert.equal((await ref.get()).exists, false);
  });
  await check('SDK rejects a malformed callable envelope', async () => {
    expectError(await call('setParentalPin', null, alice.token, { unexpected: {} }), 400, 'INVALID_ARGUMENT');
    assert.equal((await ref.get()).exists, false);
  });
  const setup = { ...alice.scope, pin: '1234', requestId: randomUUID() };
  await check('Auth emulator sign-in token completes setup and exact HTTP retry', async () => {
    const first = await call('setParentalPin', setup, alice.token);
    assert.equal(first.status, 200); assert.equal(first.body.result.controls.has_pin, true);
    const saved = (await ref.get()).data();
    const retry = await call('setParentalPin', setup, alice.token);
    assert.equal(retry.status, 200); assert.equal(first.body.result.replayed, false);
    assert.equal(retry.body.result.replayed, true);
    assert.deepEqual(retry.body.result.controls, first.body.result.controls);
    assert.equal(retry.body.result.requestId, setup.requestId);
    assert.deepEqual((await ref.get()).data(), saved);
  });
  await check('safe read and PIN verification work through HTTP without secret material', async () => {
    const read = await call('getParentalControlsSafe', alice.scope, alice.token);
    assert.equal(read.status, 200); assert.doesNotMatch(JSON.stringify(read.body), /pin_hash|pin_salt|pin_failures|binding_revision/);
    const verify = await call('verifyParentalPin', { ...alice.scope, pin: '1234' }, alice.token);
    assert.equal(verify.status, 200); assert.equal(verify.body.result.ok, true);
  });
  await check('another genuine account token cannot impersonate the owner on any endpoint', async () => {
    const original = (await ref.get()).data();
    for (const name of names) expectError(await call(name, { ...setup, updates: { is_active: false } }, bob.token), 400, 'FAILED_PRECONDITION');
    assert.deepEqual((await ref.get()).data(), original);
  });
  await check('correct owner token cannot substitute another canonical profile', async () => {
    expectError(await call('getParentalControlsSafe', { ...alice.scope, expectedProfileId: bob.profileId }, alice.token), 400, 'FAILED_PRECONDITION');
  });
  await check('settings require PIN and valid proof updates only requested setting', async () => {
    expectError(await call('updateParentalControls', { ...alice.scope, updates: { max_screen_time_minutes: 60 } }, alice.token), 403, 'PERMISSION_DENIED');
    const update = await call('updateParentalControls', { ...alice.scope, pin: '1234', updates: { max_screen_time_minutes: 60 } }, alice.token);
    assert.equal(update.status, 200); assert.equal((await ref.get()).data().max_screen_time_minutes, 60);
  });
  await check('HTTP attempts share persistent PIN lockout across handlers', async () => {
    for (let i = 0; i < 5; i++) {
      const result = await call('verifyParentalPin', { ...alice.scope, pin: '9999' }, alice.token);
      assert.equal(result.status, 200); assert.equal(result.body.result.ok, false);
    }
    assert.equal((await ref.get()).data().pin_failures, 5);
    expectError(await call('verifyParentalPin', { ...alice.scope, pin: '1234' }, alice.token), 429, 'RESOURCE_EXHAUSTED');
    expectError(await call('updateParentalControls', { ...alice.scope, pin: '1234', updates: { is_active: false } }, alice.token), 429, 'RESOURCE_EXHAUSTED');
  });
  await check('a disabled current Auth account is denied even with its earlier token', async () => {
    const original = (await ref.get()).data(); await auth.updateUser(alice.uid, { disabled: true });
    expectError(await call('getParentalControlsSafe', alice.scope, alice.token), 401, 'UNAUTHENTICATED');
    assert.deepEqual((await ref.get()).data(), original);
  });
  console.log(`PASS ${checks} actual SDK HTTP/Auth/Firestore emulator groups; no production JWT, IAM, App Check, durable-session or phone claim`);
} finally {
  await Promise.all(users.map(uid => auth.deleteUser(uid)));
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await db.terminate();
}
