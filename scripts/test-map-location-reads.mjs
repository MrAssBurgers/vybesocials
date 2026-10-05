import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^127\.0\.0\.1:\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT, 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { collection, doc, getDoc, getDocs, query, where, limit, setDoc, updateDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(path.join(root, 'firestore.rules'), 'utf8') } });
let checks = 0;
const pass = async (name, action) => { await action(); checks++; console.log('PASS ' + name); };
try {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [uid, profile] of [['alice', 'profile-alice'], ['bob', 'profile-bob'], ['carol', 'profile-carol']]) {
      await setDoc(doc(db, 'profiles', profile), { user_id: uid });
      await setDoc(doc(db, 'user_auth_index', uid), { profile_id: profile });
    }
    await setDoc(doc(db, 'location_shares', 'profile-alice_profile-bob'), { viewer_id: 'profile-alice', sharer_id: 'profile-bob', active: true, paused: false });
    for (const profile of ['profile-bob', 'profile-carol']) await setDoc(doc(db, 'user_live_locations', profile), { user_id: profile, sharing_enabled: true, is_ghost: false, latitude: 30, longitude: -97 });
  });
  const alice = env.authenticatedContext('alice').firestore(), carol = env.authenticatedContext('carol').firestore();
  await pass('viewer-filtered share query supports canonical legacy profiles', async () => {
    const result = await assertSucceeds(getDocs(query(collection(alice, 'location_shares'), where('viewer_id', '==', 'profile-alice'), limit(201))));
    assert.equal(result.size, 1);
  });
  await pass('granted exact live document is readable', () => assertSucceeds(getDoc(doc(alice, 'user_live_locations', 'profile-bob'))));
  await pass('all-location scan stays denied', () => assertFails(getDocs(query(collection(alice, 'user_live_locations'), where('sharing_enabled', '==', true), where('is_ghost', '==', false)))));
  await pass('ungranted exact location stays denied', () => assertFails(getDoc(doc(alice, 'user_live_locations', 'profile-carol'))));
  await pass('foreign viewer share query stays denied', () => assertFails(getDocs(query(collection(carol, 'location_shares'), where('viewer_id', '==', 'profile-alice'), limit(201)))));
  await pass('missing own shares return honest empty result', async () => assert.equal((await assertSucceeds(getDocs(query(collection(carol, 'location_shares'), where('viewer_id', '==', 'profile-carol'), limit(201))))).size, 0));
  await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), 'location_shares', 'profile-alice_profile-bob'), { active: false }));
  await pass('revocation denies the next exact location read', () => assertFails(getDoc(doc(alice, 'user_live_locations', 'profile-bob'))));
  console.log(`${checks} map location rule checks passed`);
} finally { await env.cleanup(); }
