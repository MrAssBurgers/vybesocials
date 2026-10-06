import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.equal(projectId, 'demo-vybe-birthday-qa');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '../qa-tools', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const baseline = await readFile('releases/shared-theme-recovery-20261006/firestore.rules', 'utf8');
const fragment = await readFile('releases/people-discovery-20261006/private-birthday.rules.fragment', 'utf8');
const candidate = await readFile('releases/people-discovery-20261006/firestore.rules', 'utf8');
const insertion = baseline.lastIndexOf('  }');
const newline = baseline.includes('\r\n') ? '\r\n' : '\n';
assert.equal(candidate, baseline.slice(0, insertion) + fragment.replace(/\r?\n/g, newline) + newline + baseline.slice(insertion), 'No unrelated Rules changes');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: candidate } });
const user = uid => env.authenticatedContext(uid).firestore();
const owner = user('birthday-owner'), other = user('birthday-other'), guest = env.unauthenticatedContext().firestore();
const admin = env.authenticatedContext('birthday-admin', { admin: true }).firestore();
const profileId = 'birthday-canonical';
const row = { id: profileId, profile_id: profileId, user_id: 'birthday-owner', date_of_birth: '2001-05-03', updated_at: '2026-10-06T00:00:00Z' };
const binding = { version: 1, status: 'active', owner_uid: 'birthday-owner', profile_id: profileId, auth_created_at_ms: 1, revision: 'a'.repeat(48) };
const seed = (col, id, data) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), col, id), data));
const remove = (col, id) => env.withSecurityRulesDisabled(context => deleteDoc(doc(context.firestore(), col, id)));
const good = async promise => { await assertSucceeds(promise); checks++; };
const bad = async promise => { await assertFails(promise); checks++; };
let checks = 0;
try {
  await env.clearFirestore(); // Exact disposable demo project and port are asserted above.
  await seed('profiles', profileId, { user_id: 'birthday-owner' });
  await seed('user_auth_index', 'birthday-owner', { profile_id: profileId });
  await seed('_account_profile_bindings', 'birthday-owner', binding);
  // The exact active baseline denies the existing owner write: demonstrated prerequisite.
  const old = await initializeTestEnvironment({ projectId: 'demo-vybe-birthday-baseline', firestore: { host: '127.0.0.1', port: 8387, rules: baseline } });
  try {
    await old.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      await setDoc(doc(db, 'profiles', profileId), { user_id: 'birthday-owner' });
      await setDoc(doc(db, 'user_auth_index', 'birthday-owner'), { profile_id: profileId });
      await setDoc(doc(db, '_account_profile_bindings', 'birthday-owner'), binding);
    });
    await assertFails(setDoc(doc(old.authenticatedContext('birthday-owner').firestore(), 'profile_private', profileId), row)); checks++;
  }
  finally { await old.cleanup(); }
  await good(getDoc(doc(owner, 'profile_private', profileId)));
  await good(setDoc(doc(owner, 'profile_private', profileId), row));
  await good(updateDoc(doc(owner, 'profile_private', profileId), { date_of_birth: '2002-06-04' }));
  await good(getDoc(doc(owner, 'profile_private', profileId)));
  for (const client of [other, guest, admin]) {
    await bad(getDoc(doc(client, 'profile_private', profileId)));
    await bad(setDoc(doc(client, 'profile_private', profileId), row));
  }
  for (const client of [owner, other, guest, admin]) {
    await bad(getDocs(collection(client, 'profile_private')));
    await bad(deleteDoc(doc(client, 'profile_private', profileId)));
  }
  for (const patch of [{ user_id: 'birthday-other' }, { profile_id: 'birthday-other' }, { id: 'birthday-other' }, { date_of_birth: 123 }, { date_of_birth: 'not-a-date' }, { email: 'no@example.test' }, { created_at: 'forged' }]) {
    await bad(updateDoc(doc(owner, 'profile_private', profileId), patch));
  }
  // Canonical profile only, even when the raw UID alias appears to be owned.
  await bad(setDoc(doc(owner, 'profile_private', 'birthday-owner'), { ...row, id: 'birthday-owner', profile_id: 'birthday-owner' }));
  await seed('profiles', 'birthday-owner', { user_id: 'birthday-owner' });
  await bad(setDoc(doc(owner, 'profile_private', 'birthday-owner'), { ...row, id: 'birthday-owner', profile_id: 'birthday-owner' }));
  await seed('profiles', 'birthday-owner', { user_id: 'birthday-other' });
  await bad(getDoc(doc(owner, 'profile_private', profileId)));
  await bad(setDoc(doc(owner, 'profile_private', profileId), row));
  await remove('profiles', 'birthday-owner');
  for (const patch of [{ status: 'retired' }, { owner_uid: 'birthday-other' }, { profile_id: 'birthday-other' }, { revision: 'bad' }, { auth_created_at_ms: 0 }]) {
    await seed('_account_profile_bindings', 'birthday-owner', { ...binding, ...patch });
    await bad(getDoc(doc(owner, 'profile_private', profileId)));
    await bad(setDoc(doc(owner, 'profile_private', profileId), row));
  }
  await remove('_account_profile_bindings', 'birthday-owner');
  await bad(setDoc(doc(owner, 'profile_private', profileId), row));
  await seed('_account_profile_bindings', 'birthday-owner', binding);
  for (const patch of [{ user_id: 'birthday-other' }, { is_deleted: true }, { is_banned: true }, { deletion_requested_at: 'pending' }, { scheduled_purge_at: 'pending' }]) {
    await seed('profiles', profileId, { user_id: 'birthday-owner', ...patch });
    await bad(getDoc(doc(owner, 'profile_private', profileId)));
    await bad(setDoc(doc(owner, 'profile_private', profileId), row));
  }
  await seed('profiles', profileId, { user_id: 'birthday-owner' });
  for (const patch of [{ user_id: 'birthday-other' }, { id: 'birthday-other' }, { profile_id: 'birthday-other' }]) {
    await seed('profile_private', profileId, { ...row, ...patch });
    await bad(getDoc(doc(owner, 'profile_private', profileId)));
    await bad(setDoc(doc(owner, 'profile_private', profileId), row));
  }
  await seed('profile_private', profileId, { date_of_birth: '2001-05-03', user_id: null });
  await good(getDoc(doc(owner, 'profile_private', profileId)));
  await good(setDoc(doc(owner, 'profile_private', profileId), row, { merge: true }));
  // Private namespaces remain denied. No binding/index/public-profile overwrite.
  await bad(setDoc(doc(owner, '_account_profile_bindings', 'birthday-owner'), binding));
  await bad(setDoc(doc(owner, 'user_auth_index', 'birthday-owner'), { profile_id: 'birthday-other' }));
  await bad(setDoc(doc(owner, '_private_birthday_fake', 'birthday-owner'), row));
} finally { await env.cleanup(); }
console.log(`Private birthday exact-baseline Rules passed ${checks} checks`);
