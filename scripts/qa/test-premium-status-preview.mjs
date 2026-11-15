import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// A separate demo project preserves other running preview fixtures and rules.
const projectId = 'demo-vybe-premium-status';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9200');
const require = createRequire(path.resolve('functions/package.json'));
const { initializeApp: adminApp, deleteApp: deleteAdmin } = require('firebase-admin/app');
const { getAuth: adminAuth } = require('firebase-admin/auth');
const { getFirestore: adminFirestore } = require('firebase-admin/firestore');
const testRequire = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '../qa-tools', 'package.json'));
const { initializeTestEnvironment, assertFails } = testRequire('@firebase/rules-unit-testing');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { doc, getDoc, setDoc, getDocs, collection, setLogLevel } = testRequire('firebase/firestore');
setLogLevel('silent');
const rules = await readFile('work/premium-status-audit/live.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8280, rules } });
const admin = adminApp({ projectId }, `premium-status-fixtures-${randomUUID()}`);
const auth = adminAuth(admin), db = adminFirestore(admin), refs = [], users = [], apps = [], checks = [];
const id = 'premium-status-' + randomUUID();
const ordinary = { active: false, gift_active: false, is_owner: false, can_manage_gifts: false, expires_at: null, source: null };
const pass = label => { checks.push(label); console.log('PASS ' + label); };
const target = `http://127.0.0.1:8358/${projectId}/us-central1/checkPremiumSubscription`;
async function player(uid) {
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'Synthetic-demo-only-2026!' }); users.push(uid);
  const app = initializeApp({ apiKey: 'demo-local-only', projectId }, `premium-status-${uid}`); apps.push(app);
  const browserAuth = getAuth(app); connectAuthEmulator(browserAuth, 'http://127.0.0.1:9200', { disableWarnings: true });
  await signInWithEmailAndPassword(browserAuth, `${uid}@example.test`, 'Synthetic-demo-only-2026!');
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 8358);
  return httpsCallable(functions, 'checkPremiumSubscription');
}
async function seed(table, key, value) { const ref = db.collection(table).doc(key); if (!refs.some(r => r.path === ref.path)) refs.push(ref); await ref.set(value); }
try {
  const cors = await fetch(target, { method: 'OPTIONS', headers: { Origin: 'https://vybehub.app', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
  assert.equal(cors.status, 204); assert.equal(cors.headers.get('access-control-allow-origin'), 'https://vybehub.app'); pass('actual callable allows the existing browser origin');
  const guest = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}' });
  assert.equal(guest.status, 401); assert.equal((await guest.json()).error.status, 'UNAUTHENTICATED'); pass('reachable endpoint still rejects an unauthenticated request');
  const malformed = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer not-a-token' }, body: '{"data":{}}' });
  assert.equal(malformed.status, 401); pass('invalid Firebase credentials cannot reach status data');
  const alice = await player(id + '-alice'), bob = await player(id + '-bob');
  assert.deepEqual((await alice({})).data, ordinary); pass('actual Auth token returns the complete inactive status contract');
  await seed('profiles', id + '-profile', { user_id: id + '-alice', is_premium: true, is_verified: true });
  await seed('gifted_premium', id + '-legacy', { user_id: id + '-alice', is_active: true, status: 'accepted' });
  assert.deepEqual((await alice({})).data, ordinary); pass('historical writable gift and profile flags do not authorize benefits');
  const grant = { schema_version: 1, grant_id: id + '-grant', user_id: id + '-alice', gifted_by: id + '-staff', status: 'pending', is_active: false, created_at: new Date().toISOString(), accepted_at: null, revoked_at: null, expires_at: null };
  await seed('premium_grants', id + '-alice', grant);
  assert.deepEqual((await alice({})).data, ordinary); pass('pending server grant does not enable cosmetics');
  const accepted = { ...grant, status: 'accepted', is_active: true, accepted_at: new Date().toISOString() };
  await seed('premium_grants', id + '-alice', accepted);
  assert.deepEqual((await alice({})).data, { ...ordinary, active: true, gift_active: true, source: 'gift' }); pass('accepted current server grant is acknowledged');
  const aliceStatus = (await alice({})).data;
  assert.equal(aliceStatus.can_manage_gifts, false);
  assert.deepEqual((await bob({ uid: id + '-alice', userId: id + '-alice' })).data, ordinary); pass('caller-supplied account identifiers cannot read another account entitlement');
  await seed('premium_grants', id + '-alice', { ...accepted, revoked_at: new Date().toISOString(), status: 'revoked', is_active: false });
  assert.deepEqual((await alice({})).data, ordinary); pass('revocation is reflected on the next actual request');
  await seed('subscriptions', id + '-alice', { status: 'active', expires_at: 'invalid' });
  assert.deepEqual((await alice({})).data, ordinary); pass('malformed subscription expiry never means lifetime access');
  await seed('subscriptions', id + '-alice', { status: 'active', expires_at: null });
  assert.deepEqual((await alice({})).data, { ...ordinary, active: true, source: 'subscription' }); pass('explicit server-owned lifetime subscription retains its existing contract');
  for (const [label, context] of [['recipient', env.authenticatedContext(id + '-alice')], ['outsider', env.authenticatedContext(id + '-bob')], ['staff browser', env.authenticatedContext(id + '-staff', { admin: true })], ['guest', env.unauthenticatedContext()]]) {
    const client = context.firestore();
    for (const name of ['premium_grants', 'subscriptions', '_premium_gift_requests']) {
      await assertFails(getDoc(doc(client, name, id + '-alice')));
      await assertFails(getDocs(collection(client, name)));
      await assertFails(setDoc(doc(client, name, id + '-forged'), { user_id: id + '-alice', status: 'active', expires_at: null }));
    }
    pass('exact live Rules deny private entitlement reads/listing/writes for ' + label);
  }
  console.log(JSON.stringify({ projectId, checks: checks.length, assertions: '11 callable/Auth cases plus 36 exact-live-Rules SDK denial operations', scope: 'Synthetic demo data only; no live subscriptions, gifts, payments or provider calls' }));
} finally {
  for (const ref of refs) await ref.delete();
  for (const uid of users) await auth.deleteUser(uid);
  for (const app of apps) await deleteApp(app);
  await db.terminate(); await deleteAdmin(admin); await env.cleanup();
}
