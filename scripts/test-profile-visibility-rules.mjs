import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, documentId, setDoc, getDoc, getDocs, updateDoc, deleteDoc, Timestamp } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') } });
const uid = 'visibility-alice', profileId = 'visibility-alice-profile';
const alice = env.authenticatedContext(uid), bob = env.authenticatedContext('visibility-bob');
const guest = env.unauthenticatedContext(), admin = env.authenticatedContext('visibility-admin', { admin: true });
const aliasAttacker = env.authenticatedContext(profileId);
const ref = (context, id = profileId) => doc(context.firestore(), 'profile_visibility', id);
const valid = (fields = { bio: 'friends', stories: 'only_me' }) => ({ id: profileId, user_id: profileId, fields, updated_at: new Date().toISOString() });
const seed = (name, id, value) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), name, id), value));
let checks = 0;
const allow = async (label, action) => { await assertSucceeds(action()); checks++; console.log(`PASS ${label}`); };
const deny = async (label, action) => { await assertFails(action()); checks++; console.log(`PASS ${label}`); };

try {
  await env.clearFirestore();
  await seed('profiles', profileId, { user_id: uid });
  await seed('user_auth_index', uid, { profile_id: profileId });
  await seed('profiles', 'visibility-bob-profile', { user_id: 'visibility-bob' });
  await allow('owner saves canonical profile preferences', () => setDoc(ref(alice), valid()));
  await allow('owner reads canonical preferences', () => getDoc(ref(alice)));
  await allow('owner uses a query limited to its exact document', () => getDocs(query(collection(alice.firestore(), 'profile_visibility'), where(documentId(), '==', profileId))));
  for (const [name, context] of [['other', bob], ['guest', guest], ['admin claim', admin], ['UID/profile collision', aliasAttacker]]) {
    await deny(`${name} cannot read preferences`, () => getDoc(ref(context)));
    await deny(`${name} cannot rewrite preferences`, () => setDoc(ref(context), valid({ stories: 'public' })));
    await deny(`${name} cannot change a nested field`, () => updateDoc(ref(context), { 'fields.stories': 'public' }));
    await deny(`${name} cannot delete preferences to restore defaults`, () => deleteDoc(ref(context)));
  }
  for (const level of ['public', 'everyone', 'friends', 'close_friends', 'only_me', 'private']) {
    await allow(`owner selects supported level ${level}`, () => updateDoc(ref(alice), { 'fields.stories': level }));
  }
  for (const field of ['bio', 'followers', 'following', 'level', 'activity', 'location', 'posts', 'clips', 'stories', 'mutual_friends', 'vybe_dna']) {
    await allow(`owner selects supported field ${field}`, () => updateDoc(ref(alice), { [`fields.${field}`]: 'close_friends' }));
  }
  for (const value of ['unknown', '', true, false, 1, null, [], { friends: true }]) {
    await deny(`malformed visibility ${JSON.stringify(value)} is rejected`, () => updateDoc(ref(alice), { 'fields.stories': value }));
  }
  for (const value of [null, false, [], 'friends']) await deny('fields must be a map', () => setDoc(ref(alice), valid(value)));
  await deny('missing fields cannot create an implicit default', () => setDoc(ref(alice), { id: profileId }));
  await deny('unknown section cannot expand the authority schema', () => updateDoc(ref(alice), { 'fields.arbitrary_private_data': 'public' }));
  await deny('nested section value is rejected', () => updateDoc(ref(alice), { 'fields.stories.level': 'public' }));
  await deny('extra authority metadata is rejected', () => updateDoc(ref(alice), { admin: true }));
  await deny('id cannot claim a different profile', () => updateDoc(ref(alice), { id: 'visibility-bob-profile' }));
  await deny('user_id cannot claim a different profile', () => updateDoc(ref(alice), { user_id: 'visibility-bob-profile' }));
  await deny('unbounded timestamp text is rejected', () => updateDoc(ref(alice), { updated_at: 'x'.repeat(65) }));
  await deny('malformed timestamp metadata is rejected', () => updateDoc(ref(alice), { created_at: { seconds: 1 } }));
  await allow('timestamp preference metadata remains supported', () => updateDoc(ref(alice), { updated_at: Timestamp.fromMillis(1) }));
  await allow('owner can store an empty explicit map', () => setDoc(ref(alice), valid({})));
  await allow('tuple metadata is optional for migrated rows', () => setDoc(ref(alice), { fields: { stories: 'friends' } }));
  await seed('profile_visibility', profileId, { arbitrary_legacy_field: 'retained', fields: { stories: 'untrusted' } });
  await allow('owner can inspect a malformed historical row', () => getDoc(ref(alice)));
  await deny('merging a valid field cannot retain unsupported historical metadata', () => updateDoc(ref(alice), { 'fields.stories': 'only_me' }));
  await allow('owner can explicitly replace the malformed row', () => setDoc(ref(alice), valid({ stories: 'only_me' })));
  await allow('owner can delete its preferences', () => deleteDoc(ref(alice)));
  await allow('unambiguous UID alias can save preferences before migration', () => setDoc(ref(alice, uid), { id: uid, user_id: uid, fields: { stories: 'friends' } }));
  await allow('unambiguous UID alias remains owner readable', () => getDoc(ref(alice, uid)));
  await seed('profiles', uid, { user_id: 'visibility-bob' });
  await deny('UID alias loses read access if it identifies another profile', () => getDoc(ref(alice, uid)));
  await deny('UID alias cannot overwrite another profile preference', () => setDoc(ref(alice, uid), { fields: { stories: 'public' } }));
  await deny('UID alias cannot delete another profile preference', () => deleteDoc(ref(alice, uid)));
  await allow('canonical owner still saves after an unrelated alias collision', () => setDoc(ref(alice), valid()));
  await deny('owner cannot list all accounts preferences', () => getDocs(collection(alice.firestore(), 'profile_visibility')));
  await deny('descendants do not inherit preference permissions', () => setDoc(doc(alice.firestore(), 'profile_visibility', profileId, 'private', 'extra'), { data: 'unbounded' }));
  console.log(`Profile visibility rules: ${checks} checks passed.`);
} finally { await env.cleanup(); }
