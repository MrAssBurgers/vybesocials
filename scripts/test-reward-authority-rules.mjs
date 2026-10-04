import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-rewards';
assert.ok(projectId.startsWith('demo-'), 'Synthetic demo project required');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc, getDoc, collection, query, where, getDocs, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
async function yes(label, action) { await assertSucceeds(action()); checks++; console.log(`PASS ${label}`); }
async function no(label, action) { await assertFails(action()); checks++; console.log(`PASS ${label}`); }
const alice = env.authenticatedContext('reward-alice').firestore();
const bob = env.authenticatedContext('reward-bob').firestore();
const admin = env.authenticatedContext('reward-admin', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const base = { id: 'reward-alice-profile', user_id: 'reward-alice', profile_id: 'reward-alice-profile', total_xp: 0,
  current_level: 1, unclaimed_rewards: [], created_at: 'fixture', updated_at: 'fixture' };

try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'profiles', 'reward-alice-profile'), { user_id: 'reward-alice' });
    await setDoc(doc(db, 'user_auth_index', 'reward-alice'), { profile_id: 'reward-alice-profile' });
    for (const table of ['challenge_progress', 'challenge_rewards']) {
      await setDoc(doc(db, table, 'alice-auth'), { user_id: 'reward-alice', challenge_id: 'daily', is_claimed: true, xp_amount: 25 });
      await setDoc(doc(db, table, 'alice-profile'), { user_id: 'reward-alice-profile', challenge_id: 'daily', is_claimed: false });
    }
    await setDoc(doc(db, '_challenge_reward_authority', 'private-proof'), { auth_uid: 'reward-alice', is_claimed: false });
    await setDoc(doc(db, 'user_badges', 'alice-badge'), { user_id: 'reward-alice-profile', badge_id: 'earned', badge_name: 'Earned', earned_at: 'fixture' });
  });
  await yes('migrated user provisions its canonical zero-level bootstrap', () => setDoc(doc(alice, 'user_levels', base.id), base));
  await yes('native user provisions its canonical zero-level bootstrap', () => setDoc(doc(bob, 'user_levels', 'reward-bob'), { ...base, id: 'reward-bob', user_id: 'reward-bob', profile_id: 'reward-bob' }));
  await yes('owner reads initial level', () => getDoc(doc(alice, 'user_levels', base.id)));
  await yes('UID-filtered level query remains readable', () => getDocs(query(collection(alice, 'user_levels'), where('user_id', '==', 'reward-alice'))));
  await no('outsider cannot read another level', () => getDoc(doc(bob, 'user_levels', base.id)));
  for (const [label, client] of [['owner', alice], ['outsider', bob], ['admin browser', admin], ['guest', guest]]) {
    await no(`${label} cannot edit XP`, () => updateDoc(doc(client, 'user_levels', base.id), { total_xp: 9_999 }));
    await no(`${label} cannot reset a level by delete`, () => deleteDoc(doc(client, 'user_levels', base.id)));
    for (const table of ['challenge_progress', 'challenge_rewards']) {
      await no(`${label} cannot issue ${table}`, () => setDoc(doc(client, table, 'forged'), { user_id: 'reward-alice', xp_amount: 9_999, is_completed: true }));
      await no(`${label} cannot alter ${table}`, () => updateDoc(doc(client, table, 'alice-auth'), { user_id: 'reward-bob', is_claimed: false, xp_amount: 9_999 }));
      await no(`${label} cannot delete ${table}`, () => deleteDoc(doc(client, table, 'alice-auth')));
    }
    await no(`${label} cannot read private reward authority`, () => getDoc(doc(client, '_challenge_reward_authority', 'private-proof')));
    await no(`${label} cannot issue private reward authority`, () => setDoc(doc(client, '_challenge_reward_authority', 'forged'), { auth_uid: 'reward-alice' }));
    await no(`${label} cannot consume private reward authority`, () => updateDoc(doc(client, '_challenge_reward_authority', 'private-proof'), { is_claimed: true }));
    await no(`${label} cannot delete private reward authority`, () => deleteDoc(doc(client, '_challenge_reward_authority', 'private-proof')));
    await no(`${label} cannot self-award a badge`, () => setDoc(doc(client, 'user_badges', 'self-award'), { user_id: 'reward-alice', badge_id: 'owner', badge_name: 'owner' }));
    await no(`${label} cannot change badge authority`, () => updateDoc(doc(client, 'user_badges', 'alice-badge'), { badge_id: 'owner', badge_name: 'owner' }));
    await no(`${label} cannot delete a granted badge`, () => deleteDoc(doc(client, 'user_badges', 'alice-badge')));
  }
  for (const table of ['challenge_progress', 'challenge_rewards']) {
    await yes(`owner can read UID ${table}`, () => getDoc(doc(alice, table, 'alice-auth')));
    await yes(`owner can read migrated ${table}`, () => getDoc(doc(alice, table, 'alice-profile')));
    await yes(`owner can query migrated ${table}`, () => getDocs(query(collection(alice, table), where('user_id', '==', 'reward-alice-profile'))));
    await yes(`owner can query both ${table} identity aliases`, () => getDocs(query(collection(alice, table), where('user_id', 'in', ['reward-alice', 'reward-alice-profile']))));
    await no(`outsider cannot read ${table}`, () => getDoc(doc(bob, table, 'alice-auth')));
  }
  await yes('owner can query both level aliases', () => getDocs(query(collection(alice, 'user_levels'), where('user_id', 'in', ['reward-alice', 'reward-alice-profile']))));
  const future = env.authenticatedContext('fresh-reward-user').firestore();
  const freshBase = { ...base, id: 'fresh-reward-user', user_id: 'fresh-reward-user', profile_id: 'fresh-reward-user' };
  for (const patch of [{ total_xp: 1 }, { current_level: 2 }, { unclaimed_rewards: ['owner'] }, { balance: 100 }, { user_id: 'reward-bob' }, { profile_id: 'reward-bob' }, { id: 'reward-bob' }]) {
    await no(`zero bootstrap rejects ${JSON.stringify(patch)}`, () => setDoc(doc(future, 'user_levels', 'fresh-reward-user'), { ...freshBase, ...patch }));
  }
  await no('user cannot preallocate someone else’s level ID', () => setDoc(doc(future, 'user_levels', 'future-victim'), freshBase));
  await no('migrated user cannot create a duplicate UID level', () => setDoc(doc(alice, 'user_levels', 'reward-alice'), { ...base, id: 'reward-alice' }));
  await yes('owner may customize granted badge display', () => updateDoc(doc(alice, 'user_badges', 'alice-badge'), { is_pinned: true, pin_order: 2, is_primary: true, show_effect: false, updated_at: 'new' }));
  await no('outsider cannot customize another badge', () => updateDoc(doc(bob, 'user_badges', 'alice-badge'), { is_pinned: false }));
  for (const patch of [{ user_id: 'reward-bob' }, { earned_at: 'forged' }, { expires_at: null }, { is_pinned: 'true' }, { pin_order: -1 }]) {
    await no(`badge preference update rejects ${JSON.stringify(patch)}`, () => updateDoc(doc(alice, 'user_badges', 'alice-badge'), patch));
  }
  console.log(`Reward authority rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
