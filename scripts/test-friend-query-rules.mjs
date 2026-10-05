import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-/); assert.notEqual(projectId, 'demo-vybe-preview');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8387');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, getDoc, getDocs, setDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8387, rules: await readFile('firestore.rules', 'utf8') } });
let checks = 0;
const allow = async task => { await assertSucceeds(task); checks++; };
const deny = async task => { await assertFails(task); checks++; };
const seed = (name, id, data) => env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), name, id), data));
const readParty = (client, field, id) => getDocs(query(collection(client, 'friend_requests'), where(field, '==', id), where('status', '==', 'accepted')));
try {
  await env.clearFirestore();
  for (const migrated of [false, true]) for (const bound of [false, true]) {
    const uid = `friend-${migrated}-${bound}`, profile = migrated ? `legacy-${uid}` : uid;
    await seed('profiles', profile, { user_id: uid });
    await seed('user_auth_index', uid, { profile_id: profile });
    if (bound) await seed('_account_profile_bindings', uid, { version: 1, owner_uid: uid, profile_id: profile, status: 'active' });
    const client = env.authenticatedContext(uid).firestore();
    for (const alias of new Set([uid, profile])) for (const field of ['sender_id', 'receiver_id', 'recipient_id']) {
      const id = `${alias}-${field}`;
      await seed('friend_requests', id, { sender_id: 'other', receiver_id: 'other', [field]: alias, status: 'accepted' });
      await allow(readParty(client, field, alias));
      await allow(getDoc(doc(client, 'friend_requests', id)));
    }
    await deny(getDocs(collection(client, 'friend_requests')));
    await deny(readParty(client, 'receiver_id', 'foreign-profile'));
  }
  const uid = 'protected-friend', profile = 'protected-friend-profile';
  await seed('profiles', profile, { user_id: uid });
  await seed('user_auth_index', uid, { profile_id: profile });
  await seed('friend_requests', 'protected-incoming', { sender_id: 'other', receiver_id: profile, status: 'accepted' });
  await seed('friend_requests', 'protected-uid-incoming', { sender_id: 'other', receiver_id: uid, status: 'accepted' });
  const client = env.authenticatedContext(uid).firestore();
  await seed('_account_profile_bindings', uid, { version: 1, owner_uid: uid, profile_id: profile, status: 'retired' });
  await deny(readParty(client, 'receiver_id', profile)); await deny(readParty(client, 'receiver_id', uid));
  await seed('_account_profile_bindings', uid, { version: 1, owner_uid: uid, profile_id: profile, status: 'active' });
  await seed('profiles', uid, { user_id: 'different-owner' });
  await deny(readParty(client, 'receiver_id', profile)); await deny(readParty(client, 'receiver_id', uid));
  await seed('user_auth_index', 'forged-index-attacker', { profile_id: profile });
  await deny(readParty(env.authenticatedContext('forged-index-attacker').firestore(), 'receiver_id', profile));
  await deny(readParty(env.authenticatedContext(profile).firestore(), 'receiver_id', profile));
  await deny(readParty(env.unauthenticatedContext().firestore(), 'receiver_id', profile));
  const unbound = env.authenticatedContext('no-profile').firestore();
  await seed('friend_requests', 'empty-recipient', { sender_id: 'other', recipient_id: '', status: 'accepted' });
  await deny(readParty(unbound, 'recipient_id', ''));
  console.log(`Friend request query Rules: ${checks} checks passed (all three directions, both identity aliases, bound/unbound accounts, retired/colliding/forged/guest denial).`);
} finally { await env.cleanup(); }
