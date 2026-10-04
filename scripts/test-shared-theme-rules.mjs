import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.notEqual(projectId, 'demo-vybe-preview');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.notEqual(process.env.FIRESTORE_EMULATOR_HOST.split(':')[1], '8280');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, query, where, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: +port, rules: await readFile('firestore.rules', 'utf8') } });
const owner = env.authenticatedContext('share-owner').firestore();
const recipient = env.authenticatedContext('share-recipient').firestore();
const guest = env.unauthenticatedContext().firestore();
const staff = env.authenticatedContext('share-admin', { admin: true }).firestore();
let checks = 0;
const good = async promise => { await assertSucceeds(promise); checks++; };
const bad = async promise => { await assertFails(promise); checks++; };
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const name of ['owner', 'recipient']) {
      await setDoc(doc(db, 'profiles', `share-${name}-profile`), { user_id: `share-${name}` });
      await setDoc(doc(db, 'user_auth_index', `share-${name}`), { profile_id: `share-${name}-profile` });
    }
    for (const visibility of ['public', 'private', 'friends', 'unlisted']) await setDoc(doc(db, 'shared_themes', `share-${visibility}`), { creator_id: 'share-owner-profile', theme_name: 'Fixture', description: null, theme_tokens: {}, visibility, is_public: visibility === 'public' });
    await setDoc(doc(db, 'shared_themes', 'share-legacy-uid'), { creator_id: 'share-owner', theme_name: 'Legacy', is_public: false });
    for (const name of ['saved_themes', 'theme_likes']) await setDoc(doc(db, name, 'share-ref'), { user_id: 'share-owner-profile', shared_theme_id: 'share-public' });
    for (const name of ['_shared_theme_authority', '_shared_theme_receipts', '_shared_theme_cursors', '_theme_codes', '_theme_code_receipts']) await setDoc(doc(db, name, 'share-secret'), { owner_uid: 'share-owner' });
    await setDoc(doc(db, 'blocked_users', 'share-block'), { blocker_id: 'share-owner', blocked_id: 'share-recipient-profile' });
  });
  for (const visibility of ['public', 'private', 'friends', 'unlisted']) {
    await good(getDoc(doc(owner, 'shared_themes', `share-${visibility}`)));
    await bad(getDoc(doc(guest, 'shared_themes', `share-${visibility}`)));
    await bad(getDoc(doc(recipient, 'shared_themes', `share-${visibility}`)));
  }
  await bad(getDocs(query(collection(recipient, 'shared_themes'), where('is_public', '==', true))));
  await bad(getDocs(query(collection(owner, 'shared_themes'), where('is_public', '==', true))));
  await good(getDocs(query(collection(owner, 'shared_themes'), where('creator_id', '==', 'share-owner-profile'))));
  await good(getDoc(doc(owner, 'shared_themes', 'share-legacy-uid')));
  await bad(getDocs(collection(recipient, 'shared_themes')));
  await bad(setDoc(doc(owner, 'shared_themes', 'share-forged'), { creator_id: 'share-owner-profile', is_public: true }));
  await good(updateDoc(doc(owner, 'shared_themes', 'share-public'), { theme_name: 'Renamed', description: 'Safe metadata edit' }));
  await good(updateDoc(doc(owner, 'shared_themes', 'share-legacy-uid'), { theme_name: 'Legacy rename' }));
  for (const patch of [{ creator_id: 'share-recipient-profile' }, { theme_tokens: { new: true } }, { is_public: false }, { visibility: 'private' }, { likes_count: 999 }, { recipients: ['share-recipient'] }, { theme_name: '' }, { description: 'x'.repeat(1001) }]) {
    await bad(updateDoc(doc(owner, 'shared_themes', 'share-public'), patch));
  }
  for (const name of ['saved_themes', 'theme_likes']) {
    await good(getDoc(doc(owner, name, 'share-ref')));
    await good(getDocs(query(collection(owner, name), where('user_id', '==', 'share-owner-profile'))));
    await bad(getDoc(doc(recipient, name, 'share-ref')));
    await bad(getDocs(collection(owner, name)));
    for (const client of [owner, recipient, guest, staff]) {
      await bad(setDoc(doc(client, name, 'share-forged'), { user_id: 'share-owner-profile', shared_theme_id: 'share-private' }));
      await bad(updateDoc(doc(client, name, 'share-ref'), { shared_theme_id: 'share-private' }));
      await bad(deleteDoc(doc(client, name, 'share-ref')));
    }
  }
  for (const name of ['_shared_theme_authority', '_shared_theme_receipts', '_shared_theme_cursors', '_theme_codes', '_theme_code_receipts']) {
    for (const client of [owner, recipient, guest, staff]) {
      await bad(getDoc(doc(client, name, 'share-secret')));
      await bad(setDoc(doc(client, name, 'share-secret'), { owner_uid: 'share-owner', visibility: 'public' }));
    }
  }
  await bad(deleteDoc(doc(recipient, 'shared_themes', 'share-private')));
  await good(deleteDoc(doc(owner, 'shared_themes', 'share-private')));
} finally { await env.cleanup(); }
console.log(`Shared-theme rules passed ${checks} checks`);
