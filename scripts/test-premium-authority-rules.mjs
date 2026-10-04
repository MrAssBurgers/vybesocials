import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-premium';
assert.ok(projectId.startsWith('demo-'), 'Use a demo project only');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.ok(endpoint && /^(127\.0\.0\.1|localhost):\d+$/.test(endpoint), 'A loopback Firestore emulator is required');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = endpoint.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const alice = env.authenticatedContext('premium-alice').firestore();
const bob = env.authenticatedContext('premium-bob').firestore();
const admin = env.authenticatedContext('premium-staff', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const seed = (table, id, value) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), table, id), value));
let checks = 0;
async function allowed(label, fn) { await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
try {
  await env.clearFirestore();
  await seed('profiles', 'legacy-alice', { user_id: 'premium-alice', display_name: 'Alice', is_verified: true, is_premium: true, premium_status: 'accepted', premium_expires_at: null, coins_balance: 100 });
  await seed('user_auth_index', 'premium-alice', { profile_id: 'legacy-alice' });
  await seed('gifted_premium', 'legacy-gift', { user_id: 'premium-alice', gifted_by: 'premium-staff', status: 'pending', is_active: false });
  for (const table of ['premium_grants', '_premium_gift_requests', 'subscriptions']) {
    await seed(table, 'premium-alice', { user_id: 'premium-alice', schema_version: 1, status: 'accepted', is_active: true, expires_at: null });
    for (const [label, client] of [['recipient', alice], ['outsider', bob], ['staff browser', admin], ['guest', guest]]) {
      await denied(`${label} cannot read ${table}`, () => getDoc(doc(client, table, 'premium-alice')));
      await denied(`${label} cannot list ${table}`, () => getDocs(collection(client, table)));
      await denied(`${label} cannot allocate ${table}`, () => setDoc(doc(client, table, 'unallocated'), { user_id: 'premium-alice', status: 'accepted', is_active: true }));
      await denied(`${label} cannot edit ${table}`, () => updateDoc(doc(client, table, 'premium-alice'), { status: 'accepted', is_active: true }));
      await denied(`${label} cannot delete ${table}`, () => deleteDoc(doc(client, table, 'premium-alice')));
    }
  }
  await allowed('recipient retains historical gift read for support', () => getDoc(doc(alice, 'gifted_premium', 'legacy-gift')));
  for (const [label, client] of [['recipient', alice], ['staff browser', admin], ['outsider', bob]]) {
    await denied(`${label} cannot issue legacy gift`, () => setDoc(doc(client, 'gifted_premium', 'forged'), { user_id: 'premium-alice', gifted_by: 'premium-staff', is_active: true }));
    await denied(`${label} cannot activate historical gift`, () => updateDoc(doc(client, 'gifted_premium', 'legacy-gift'), { is_active: true, status: 'accepted' }));
    await denied(`${label} cannot delete historical gift`, () => deleteDoc(doc(client, 'gifted_premium', 'legacy-gift')));
  }
  for (const field of ['is_verified', 'is_premium', 'premium_status', 'premium_expires_at', 'coins_balance']) {
    const value = field === 'coins_balance' ? 999999 : field === 'premium_status' ? 'forged-premium' : field === 'premium_expires_at' ? '2099-01-01' : false;
    await denied(`signup cannot self-award ${field}`, () => setDoc(doc(bob, 'profiles', 'premium-bob'), { user_id: 'premium-bob', [field]: value }));
    for (const [label, client] of [['profile owner', alice], ['staff browser', admin]]) {
      await denied(`${label} cannot change protected ${field}`, () => updateDoc(doc(client, 'profiles', 'legacy-alice'), { [field]: value }));
      await denied(`${label} cannot remove protected ${field} with a replacement`, () => setDoc(doc(client, 'profiles', 'legacy-alice'), { user_id: 'premium-alice', display_name: 'Replacement' }));
    }
  }
  await allowed('ordinary signup still creates profile', () => setDoc(doc(bob, 'profiles', 'premium-bob'), { user_id: 'premium-bob', display_name: 'Bob' }));
  await allowed('ordinary profile edit preserves protected fields', () => updateDoc(doc(alice, 'profiles', 'legacy-alice'), { display_name: 'Alice updated', bio: 'Hello' }));
  await allowed('owner private settings remain editable without parent bypass', () => setDoc(doc(alice, 'profiles', 'legacy-alice', 'settings', 'theme'), { accent: 'purple' }));
  await denied('outsider cannot replace profile', () => updateDoc(doc(bob, 'profiles', 'legacy-alice'), { user_id: 'premium-bob', is_premium: true }));
  console.log(`Premium authority rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
