import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
assert.match(process.env.GCLOUD_PROJECT || '', /^demo-/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const { getDoc, setDoc, doc, setLogLevel } = require('firebase/firestore'); setLogLevel('silent');
const before = execFileSync('git', ['show', '4ac93f56:firestore.rules'], { encoding: 'utf8' });
const after = await readFile('firestore.rules', 'utf8');
let checked = 0, requiresSetup = 0;
const outcome = async task => { try { await task; return true; } catch (error) { if (error.code === 'permission-denied') return false; throw error; } };
const environments = await Promise.all([['demo-vybe-profile-before', before], ['demo-vybe-profile-unbound', after], ['demo-vybe-profile-bound', after]].map(([projectId, rules]) => initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules } })));
try {
  for (const environment of environments) await environment.clearFirestore();
  for (const migrated of [false, true]) for (const roleCollection of ['user_roles', 'user_roles_auth']) for (const alias of ['uid', 'profile']) for (const role of ['owner', 'admin', 'moderator']) {
    const uid = `staff-${migrated}-${roleCollection}-${alias}-${role}`, profileId = migrated ? `legacy-${uid}` : uid;
    const roleId = `${alias === 'uid' ? uid : profileId}_${role}`;
    for (const [position, environment] of environments.entries()) await environment.withSecurityRulesDisabled(async context => {
      const store = context.firestore();
      await setDoc(doc(store, 'profiles', profileId), { user_id: uid });
      await setDoc(doc(store, 'user_auth_index', uid), { profile_id: profileId });
      // Protected output of mandatory checked setup. The real backend fixture
      // separately proves only the server can issue this canonical binding.
      if (position === 2) await setDoc(doc(store, '_account_profile_bindings', uid), { version: 1, owner_uid: uid, profile_id: profileId, status: 'active' });
      await setDoc(doc(store, roleCollection, roleId), { user_id: alias === 'uid' ? uid : profileId, role, enabled: true });
      await setDoc(doc(store, 'bug_reports', 'staff-only'), { reporter_id: 'someone-else' });
    });
    const clients = environments.map(environment => environment.authenticatedContext(uid, { admin: false }).firestore());
    const reads = await Promise.all(clients.map(client => outcome(getDoc(doc(client, 'bug_reports', 'staff-only')))));
    assert.ok(!reads[0] || reads[2], `NEW bound read-budget regression: ${migrated}/${roleCollection}/${alias}/${role}`);
    if (reads[0] && !reads[1]) { requiresSetup++; console.log(`NEW setup prerequisite (read): ${migrated}/${roleCollection}/${alias}/${role}`); }
    if (!reads[0]) console.log(`Confirmed pre-existing role-read limit: ${roleCollection}/${alias}/${role}`);
    const writes = await Promise.all(clients.map(client => outcome(setDoc(doc(client, 'user_roles', `new-${uid}`), { user_id: `new-${uid}`, role: 'moderator' }))));
    assert.ok(!writes[0] || writes[2], `NEW bound role-write budget regression: ${migrated}/${roleCollection}/${alias}/${role}`);
    if (writes[0] && !writes[1]) { requiresSetup++; console.log(`NEW setup prerequisite (role write): ${migrated}/${roleCollection}/${alias}/${role}`); }
    if (role === 'moderator') assert.deepEqual(writes, [false, false, false]);
    checked += 4;
  }
  console.log(`Account profile rule compatibility: ${checked} exact-baseline comparisons passed; ${requiresSetup} previously allowed operations require checked setup before cutover.`);
} finally { await Promise.all(environments.map(environment => environment.cleanup())); }
