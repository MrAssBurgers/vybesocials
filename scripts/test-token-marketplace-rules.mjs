import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-tokens';
assert.match(projectId, /^demo-[a-z0-9-]+$/, 'Demo project required');
const endpoint = process.env.FIRESTORE_EMULATOR_HOST;
assert.match(endpoint || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Loopback Firestore emulator required');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, getDocs, deleteField, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = endpoint.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const alice = env.authenticatedContext('token-alice').firestore();
const bob = env.authenticatedContext('token-bob').firestore();
const admin = env.authenticatedContext('token-staff', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const seed = (table, id, value) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), table, id), value));
let checks = 0;
async function allowed(label, fn) { await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
try {
  await env.clearFirestore();
  const equipped = Object.fromEntries(['title', 'effect', 'frame', 'name_color', 'profile_theme', 'badge_id'].map(key => [`equipped_${key}`, `verified-${key}`]));
  await seed('profiles', 'legacy-alice', { user_id: 'token-alice', ...equipped, bio: 'Hello' });
  await seed('profiles', 'token-bob', { user_id: 'token-bob' });
  await seed('user_auth_index', 'token-alice', { profile_id: 'legacy-alice' });
  const protectedTables = ['token_wallets', 'token_entitlements', 'token_boosts', 'token_events', '_token_purchase_requests', '_token_credit_receipts', '_token_credit_day_limits', '_verified_xp_authority', '_badge_grant_authority'];
  for (const table of protectedTables) {
    await seed(table, 'token-alice', { user_id: 'token-alice', schema_version: 1, balance: 10, active: true });
    for (const [label, client] of [['owner', alice], ['outsider', bob], ['staff browser', admin], ['guest', guest]]) {
      await denied(`${label} cannot read ${table}`, () => getDoc(doc(client, table, 'token-alice')));
      await denied(`${label} cannot list ${table}`, () => getDocs(collection(client, table)));
      await denied(`${label} cannot forge ${table}`, () => setDoc(doc(client, table, 'unallocated'), { user_id: 'token-alice', balance: 999999, active: true }));
      await denied(`${label} cannot overwrite ${table}`, () => updateDoc(doc(client, table, 'token-alice'), { balance: 999999, expires_at: null, uses_remaining: 999999 }));
      await denied(`${label} cannot erase ${table}`, () => deleteDoc(doc(client, table, 'token-alice')));
    }
  }
  for (const table of ['vybe_tokens', 'token_transactions', 'marketplace_purchases', 'user_active_boosts']) {
    await seed(table, 'legacy', { user_id: 'legacy-alice', balance: 10, item_id: 'theme_neon', consumed: true, uses_remaining: 0 });
    await seed(table, 'foreign', { user_id: 'token-bob', balance: 10 });
    await allowed(`owner retains ${table} history for reconciliation`, () => getDoc(doc(alice, table, 'legacy')));
    for (const [label, client] of [['owner', alice], ['outsider', bob], ['staff browser', admin]]) {
      await denied(`${label} cannot create old ${table} receipt`, () => setDoc(doc(client, table, 'forged'), { user_id: 'token-alice', balance: 999999, item_id: 'theme_neon' }));
      await denied(`${label} cannot reset old ${table}`, () => updateDoc(doc(client, table, 'legacy'), { balance: 999999, consumed: false, expires_at: null, uses_remaining: 999999 }));
      await denied(`${label} cannot erase old ${table}`, () => deleteDoc(doc(client, table, 'legacy')));
    }
    await denied(`cannot retarget foreign ${table} ownership`, () => updateDoc(doc(alice, table, 'foreign'), { user_id: 'token-alice' }));
  }
  for (const field of Object.keys(equipped)) {
    const signup = env.authenticatedContext(`signup-${field}`).firestore();
    await denied(`signup cannot self-equip ${field}`, () => setDoc(doc(signup, 'profiles', `signup-${field}`), { user_id: `signup-${field}`, [field]: 'premium-forged' }));
    for (const [label, client] of [['owner', alice], ['staff browser', admin]]) {
      await denied(`${label} cannot change paid ${field}`, () => updateDoc(doc(client, 'profiles', 'legacy-alice'), { [field]: 'premium-forged' }));
      await denied(`${label} cannot delete ${field}`, () => updateDoc(doc(client, 'profiles', 'legacy-alice'), { [field]: deleteField() }));
    }
  }
  await allowed('ordinary profile edits preserve paid cosmetics', () => updateDoc(doc(alice, 'profiles', 'legacy-alice'), { display_name: 'Alice', bio: 'New' }));
  await allowed('free personal theme settings remain editable', () => setDoc(doc(alice, 'profiles', 'legacy-alice', 'settings', 'appearance'), { accent: 'purple', motion: 'balanced' }));
  await denied('cannot replace profile to remove paid fields', () => setDoc(doc(alice, 'profiles', 'legacy-alice'), { user_id: 'token-alice' }));
  await allowed('author can publish retained reward source', () => setDoc(doc(alice, 'posts', 'source'), { author_id: 'legacy-alice', caption: 'An actual post', type: 'post' }));
  await allowed('author can edit content', () => updateDoc(doc(alice, 'posts', 'source'), { caption: 'Edited' }));
  for (const [label, client] of [['author', alice], ['outsider', bob], ['staff browser', admin]]) {
    await denied(`${label} cannot retarget post reward source`, () => updateDoc(doc(client, 'posts', 'source'), { author_id: 'token-bob' }));
  }
  await allowed('UID comment source can be created', () => setDoc(doc(alice, 'comments', 'uid-comment'), { user_id: 'token-alice', post_id: 'source', content: 'Hello' }));
  await allowed('legacy author comment source can be created', () => setDoc(doc(alice, 'comments', 'author-comment'), { author_id: 'legacy-alice', post_id: 'source', content: 'Hello' }));
  await allowed('consistent dual identity comment can be created', () => setDoc(doc(alice, 'comments', 'dual-comment'), { user_id: 'token-alice', author_id: 'legacy-alice', post_id: 'source', content: 'Hello' }));
  await denied('cannot forge another user_id with own author_id', () => setDoc(doc(alice, 'comments', 'spoof-a'), { user_id: 'token-bob', author_id: 'legacy-alice', post_id: 'source', content: 'Hello' }));
  await denied('cannot forge another author_id with own user_id', () => setDoc(doc(alice, 'comments', 'spoof-b'), { user_id: 'token-alice', author_id: 'token-bob', post_id: 'source', content: 'Hello' }));
  await allowed('comment author can edit content', () => updateDoc(doc(alice, 'comments', 'dual-comment'), { content: 'Updated' }));
  for (const [field, value] of [['user_id', 'token-bob'], ['author_id', 'token-bob'], ['post_id', 'another-post']]) {
    for (const [label, client] of [['owner', alice], ['staff browser', admin]]) {
      await denied(`${label} cannot change comment ${field}`, () => updateDoc(doc(client, 'comments', 'dual-comment'), { [field]: value }));
    }
  }
  await allowed('comment author retains deletion control', () => deleteDoc(doc(alice, 'comments', 'dual-comment')));
  console.log(`Token marketplace rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
