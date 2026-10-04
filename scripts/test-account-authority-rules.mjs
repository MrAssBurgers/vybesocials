import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Synthetic fixtures only: never fall through to a live endpoint or credential.
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-authority';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run under Firebase emulators:exec --only firestore');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const rules = await readFile('firestore.rules', 'utf8');
// Reports are callable-only. bug_reports retains the same staff-read predicate
// and provides an unchanged surface for these existing role-authority probes.
// Reconstruct only the pre-fix staff-role predicate in an isolated demo project.
// This proves the late-alias read budget limitation existed before this change.
const originalRules = rules
  .replace('activeStaffRoleAt(col, profileId(), role)', 'exists(/databases/$(database)/documents/$(col)/$(profileId() + \'_\' + role))')
  .replace('activeStaffRoleAt(col, uid(), role)', 'exists(/databases/$(database)/documents/$(col)/$(uid() + \'_\' + role))');
assert.notEqual(originalRules, rules, 'Baseline probe must restore the original exists-only predicate');
const baseline = await initializeTestEnvironment({ projectId: 'demo-vybe-authority-baseline', firestore: { host, port: Number(port), rules: originalRules } });
let baselineChecks = 0;
try {
  await baseline.clearFirestore();
  for (const role of ['admin', 'moderator']) {
    for (const alias of ['uid', 'profile']) {
      const uid = `baseline-${role}-${alias}`; const profileId = `legacy-${uid}`;
      await baseline.withSecurityRulesDisabled(async context => {
        const database = context.firestore();
        await setDoc(doc(database, 'profiles', profileId), { user_id: uid });
        await setDoc(doc(database, 'user_auth_index', uid), { profile_id: profileId });
        const identity = alias === 'uid' ? uid : profileId;
        await setDoc(doc(database, 'user_roles_auth', `${identity}_${role}`), { user_id: identity, role });
        await setDoc(doc(database, 'bug_reports', 'staff-only'), { reporter_id: uid });
      });
      await assertFails(getDoc(doc(baseline.authenticatedContext(uid, { admin: false }).firestore(), 'bug_reports', 'staff-only')));
      baselineChecks++; console.log(`BASELINE LIMIT: migrated user_roles_auth-only ${alias}/${role} exceeds original role lookup budget`);
    }
  }
} finally { await baseline.cleanup(); }
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules } });
let checks = 0;
async function allowed(label, action) { await assertSucceeds(action()); checks++; console.log(`PASS ${label}`); }
async function denied(label, action) { await assertFails(action()); checks++; console.log(`PASS ${label}`); }
const user = uid => env.authenticatedContext(uid, { admin: false }).firestore();
const alice = user('authority-alice');
const bob = user('authority-bob');
const admin = env.authenticatedContext('authority-admin', { admin: true }).firestore();
const guest = env.unauthenticatedContext().firestore();
const seed = async (collectionName, id, data) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), collectionName, id), data));

try {
  await env.clearFirestore();
  await seed('profiles', 'legacy-alice', { user_id: 'authority-alice' });
  await seed('spotify_connections', 'authority-alice', { user_id: 'authority-alice', access_token: 'FAKE_TEST_ACCESS', refresh_token: 'FAKE_TEST_REFRESH', display_name: 'Test account' });
  await seed('spotify_connections', 'legacy-connection', { user_id: 'legacy-alice', access_token: 'FAKE_LEGACY_ACCESS', refresh_token: 'FAKE_LEGACY_REFRESH' });
  await seed('bug_reports', 'staff-only', { reporter_id: 'authority-alice', reason: 'Synthetic rule test' });

  await allowed('Spotify owner can read existing connection', () => getDoc(doc(alice, 'spotify_connections', 'authority-alice')));
  await allowed('Spotify legacy profile owner can read migrated connection', () => getDoc(doc(alice, 'spotify_connections', 'legacy-connection')));
  await allowed('Spotify connection status query remains compatible', () => getDocs(query(collection(alice, 'spotify_connections'), where('user_id', '==', 'authority-alice'))));
  await allowed('existing admin read remains available', () => getDoc(doc(admin, 'spotify_connections', 'authority-alice')));
  await denied('outsider cannot read Spotify credential row', () => getDoc(doc(bob, 'spotify_connections', 'authority-alice')));
  await denied('guest cannot read Spotify credential row', () => getDoc(doc(guest, 'spotify_connections', 'authority-alice')));
  await denied('outsider cannot claim connection by changing user_id', () => updateDoc(doc(bob, 'spotify_connections', 'authority-alice'), { user_id: 'authority-bob' }));
  await denied('outsider cannot replace legacy credential row with new owner', () => setDoc(doc(bob, 'spotify_connections', 'legacy-connection'), { user_id: 'authority-bob' }));
  await denied('outsider remains unable to read after rejected claim', () => getDoc(doc(bob, 'spotify_connections', 'authority-alice')));
  for (const [label, client] of [['owner', alice], ['other account', bob], ['admin client', admin]]) {
    await denied(`${label} cannot mint or preallocate an OAuth connection`, () => setDoc(doc(client, 'spotify_connections', 'unallocated-target'), { user_id: 'authority-bob', refresh_token: 'FAKE_FORGED' }));
    await denied(`${label} cannot overwrite OAuth credentials`, () => updateDoc(doc(client, 'spotify_connections', 'authority-alice'), { access_token: 'FAKE_FORGED' }));
    await denied(`${label} cannot change connection preference fields`, () => updateDoc(doc(client, 'spotify_connections', 'authority-alice'), { display_name: 'changed' }));
    await denied(`${label} cannot delete credentials directly`, () => deleteDoc(doc(client, 'spotify_connections', 'authority-alice')));
  }
  await allowed('music preference create uses auth UID canonical key', () => setDoc(doc(bob, 'music_settings', 'authority-bob'), { user_id: 'authority-bob', show_listening_activity: true }));
  await allowed('music preference create accepts owned legacy profile key', () => setDoc(doc(alice, 'music_settings', 'legacy-alice'), { user_id: 'legacy-alice', show_listening_activity: false }));
  await allowed('music preferences still update in place', () => updateDoc(doc(alice, 'music_settings', 'legacy-alice'), { show_listening_activity: true }));
  await denied('outsider cannot claim existing music preferences', () => updateDoc(doc(bob, 'music_settings', 'legacy-alice'), { user_id: 'authority-bob', show_listening_activity: false }));
  await denied('owner cannot transfer preferences to another user', () => updateDoc(doc(alice, 'music_settings', 'legacy-alice'), { user_id: 'authority-bob' }));
  await denied('outsider cannot preallocate another account preference key', () => setDoc(doc(bob, 'music_settings', 'authority-alice'), { user_id: 'authority-bob' }));
  await seed('music_settings', 'imported-random-row', { user_id: 'legacy-alice', show_on_profile: true });
  await allowed('migrated random-ID preferences remain editable by existing owner', () => updateDoc(doc(alice, 'music_settings', 'imported-random-row'), { show_on_profile: false }));
  await denied('outsider cannot read music preferences after rejected claim', () => getDoc(doc(bob, 'music_settings', 'legacy-alice')));
  await allowed('owner can delete music preference row', () => deleteDoc(doc(alice, 'music_settings', 'legacy-alice')));

  // Exercise both collections and both identity aliases, including the last
  // moderator fallback, to catch Rules document-access limit regressions.
  for (const roleCollection of ['user_roles', 'user_roles_auth']) {
    for (const alias of ['uid', 'profile']) {
      for (const role of ['owner', 'admin', 'moderator']) {
        const uid = `staff-${roleCollection}-${alias}-${role}`;
        const profileId = `legacy-${uid}`;
        const client = user(uid);
        await seed('profiles', profileId, { user_id: uid });
        await seed('user_auth_index', uid, { profile_id: profileId });
        const identity = alias === 'uid' ? uid : profileId;
        const id = `${identity}_${role}`;
        const roleRow = { user_id: identity, role };
        await seed(roleCollection, id, roleRow);
        const inheritedReadLimit = roleCollection === 'user_roles_auth' && role !== 'owner';
        const activeRead = inheritedReadLimit ? denied : allowed;
        await activeRead(`${inheritedReadLimit ? 'documented baseline read limit' : 'legacy flagless staff access'}: ${roleCollection}/${alias} ${role}`, () => getDoc(doc(client, 'bug_reports', 'staff-only')));
        await seed(roleCollection, id, { ...roleRow, enabled: true });
        await activeRead(`${inheritedReadLimit ? 'documented baseline read limit' : 'enabled staff access'}: ${roleCollection}/${alias} ${role}`, () => getDoc(doc(client, 'bug_reports', 'staff-only')));
        if (role !== 'moderator') {
          await allowed(`enabled ${roleCollection}/${alias} ${role} may manage roles`, () => setDoc(doc(client, 'user_roles', `granted-${uid}_moderator`), { user_id: `granted-${uid}`, role: 'moderator' }));
        } else {
          await denied(`moderator ${roleCollection}/${alias} cannot grant admin`, () => setDoc(doc(client, 'user_roles', `granted-${uid}_admin`), { user_id: `granted-${uid}`, role: 'admin' }));
        }
        await seed(roleCollection, id, { ...roleRow, enabled: false });
        await denied(`disabled ${roleCollection}/${alias} ${role} loses staff read`, () => getDoc(doc(client, 'bug_reports', 'staff-only')));
        await denied(`disabled ${roleCollection}/${alias} ${role} cannot restore own role`, () => updateDoc(doc(client, roleCollection, id), { enabled: true }));
        await denied(`disabled ${roleCollection}/${alias} ${role} cannot grant a new owner`, () => setDoc(doc(client, 'user_roles', `restored-${uid}_owner`), { user_id: uid, role: 'owner' }));
      }
    }
  }
  for (const role of ['owner', 'admin', 'moderator']) {
    const uid = `native-auth-role-${role}`;
    await seed('user_roles_auth', `${uid}_${role}`, { user_id: uid, role });
    await allowed(`non-migrated user_roles_auth-only ${role} retains staff read`, () => getDoc(doc(user(uid), 'bug_reports', 'staff-only')));
    await seed('user_roles_auth', `${uid}_${role}`, { user_id: uid, role, enabled: false });
    await denied(`disabled non-migrated user_roles_auth-only ${role} loses staff read`, () => getDoc(doc(user(uid), 'bug_reports', 'staff-only')));
  }
  for (const enabled of [null, 'true', 'false', 1, 0]) {
    await seed('user_roles', 'authority-bob_admin', { user_id: 'authority-bob', role: 'admin', enabled });
    await denied(`malformed enabled=${JSON.stringify(enabled)} does not grant authority`, () => getDoc(doc(bob, 'bug_reports', 'staff-only')));
  }
  await allowed('explicit admin custom claim still grants staff authority', () => getDoc(doc(admin, 'bug_reports', 'staff-only')));
  await denied('ordinary account cannot self-grant a staff role', () => setDoc(doc(alice, 'user_roles', 'authority-alice_owner'), { user_id: 'authority-alice', role: 'owner', enabled: true }));
  console.log(`Account authority rules: ${checks} checks passed; ${baselineChecks} isolated inherited-limit probes confirmed (not fixed by this security change)`);
} finally { await env.cleanup(); }
