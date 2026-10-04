import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, updateDoc, deleteDoc, writeBatch } = require('firebase/firestore');
const { ref: storageRef, uploadBytes, getBytes, listAll } = require('firebase/storage');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile('firestore.rules', 'utf8') },
  storage: { host: storageHost, port: Number(storagePort), rules: await readFile('storage.rules', 'utf8') } });
const uid = 'story-alice'; const profile = 'story-alice-profile';
const alice = env.authenticatedContext(uid), bob = env.authenticatedContext('story-bob'), guest = env.unauthenticatedContext(), admin = env.authenticatedContext('story-admin', { admin: true });
let checks = 0;
const allow = async (label, run) => { await assertSucceeds(run()); checks++; console.log(`PASS ${label}`); };
const deny = async (label, run) => { await assertFails(run()); checks++; console.log(`PASS ${label}`); };
const story = (patch = {}) => ({ author_id: profile, media_url: 'https://example.test/synthetic.png', media_type: 'image', caption: 'Fixture', expires_at: '2026-10-05T12:00:00.000Z', publish_receipt_id: 'receipt', ...patch });
const receipt = (patch = {}) => ({ version: 1, owner_uid: uid, profile_id: profile, story_id: 'published', ...patch });
const ref = (context, collectionName, id) => doc(context.firestore(), collectionName, id);
const seed = async (collectionName, id, value) => env.withSecurityRulesDisabled(context => setDoc(ref(context, collectionName, id), value));
try {
  await env.clearFirestore();
  await seed('profiles', profile, { user_id: uid }); await seed('user_auth_index', uid, { profile_id: profile });
  await seed('profiles', 'story-bob-profile', { user_id: 'story-bob' }); await seed('user_auth_index', 'story-bob', { profile_id: 'story-bob-profile' });
  await seed('stories', 'published', story()); await seed('_story_publish_receipts', 'receipt', receipt());
  await seed('_story_publish_limits', 'limit', { version: 1, owner_uid: uid, count: 1 });
  await seed('_close_friend_authority', 'proof', { version: 1, owner_uid: uid, friend_uid: 'story-bob', enabled: true });
  for (const [name, context] of [['owner', alice], ['other', bob], ['guest', guest], ['admin', admin]]) {
    for (const collectionName of ['_story_publish_receipts', '_story_publish_limits', '_close_friend_authority']) {
      const existing = collectionName.endsWith('receipts') ? 'receipt' : collectionName.endsWith('limits') ? 'limit' : 'proof';
      await deny(`${name} cannot read ${collectionName}`, () => getDoc(ref(context, collectionName, existing)));
      await deny(`${name} cannot list ${collectionName}`, () => getDocs(collection(context.firestore(), collectionName)));
      await deny(`${name} cannot create ${collectionName}`, () => setDoc(ref(context, collectionName, `new-${name}`), receipt()));
      await deny(`${name} cannot rewrite ${collectionName}`, () => updateDoc(ref(context, collectionName, existing), { owner_uid: 'story-bob' }));
      await deny(`${name} cannot remove ${collectionName}`, () => deleteDoc(ref(context, collectionName, existing)));
    }
    await deny(`${name} cannot directly create a story`, () => setDoc(ref(context, 'stories', `direct-${name}`), story()));
    await deny(`${name} cannot bypass callable admission with a direct story read`, () => getDoc(ref(context, 'stories', 'published')));
    await deny(`${name} cannot list private story rows`, () => getDocs(collection(context.firestore(), 'stories')));
    await deny(`${name} cannot directly overwrite an existing story`, () => setDoc(ref(context, 'stories', 'published'), story({ author_id: 'story-bob-profile' })));
    for (const [field, value] of [['author_id', 'story-bob'], ['caption', 'edited'], ['expires_at', '2099-01-01T00:00:00.000Z'], ['publish_receipt_id', 'forged'], ['is_close_friends_only', false]]) {
      await deny(`${name} cannot update story ${field}`, () => updateDoc(ref(context, 'stories', 'published'), { [field]: value }));
    }
  }
  await deny('other account cannot delete receipt-bound story', () => deleteDoc(ref(bob, 'stories', 'published')));
  await allow('receipt owner deletes its story', () => deleteDoc(ref(alice, 'stories', 'published')));
  await env.withSecurityRulesDisabled(async context => assert.equal((await getDoc(ref(context, '_story_publish_receipts', 'receipt'))).exists(), true)); checks++;
  await deny('owner cannot recreate a deleted receipt-bound story', () => setDoc(ref(alice, 'stories', 'published'), story()));
  await seed('stories', 'published', story());
  await allow('staff removal preserves the retained retry receipt', () => deleteDoc(ref(admin, 'stories', 'published')));
  for (const patch of [{ owner_uid: 'story-bob' }, { profile_id: 'other' }, { story_id: 'other' }, { version: 2 }]) {
    await seed('stories', 'published', story()); await seed('_story_publish_receipts', 'receipt', receipt(patch));
    await deny('mismatched receipt tuple cannot grant owner deletion', () => deleteDoc(ref(alice, 'stories', 'published')));
  }
  await seed('stories', 'legacy', { author_id: profile, caption: 'Retained pre-receipt story' });
  await allow('legacy migrated owner can delete a retained story', () => deleteDoc(ref(alice, 'stories', 'legacy')));
  await seed('stories', 'legacy-uid', { author_id: uid, caption: 'Retained UID story' });
  await allow('legacy UID owner can delete a retained story', () => deleteDoc(ref(alice, 'stories', 'legacy-uid')));
  await seed('stories', 'broken-proof', story({ publish_receipt_id: 'missing' }));
  await deny('a missing proof never falls back to legacy author authority', () => deleteDoc(ref(alice, 'stories', 'broken-proof')));
  await seed('stories', 'published', story()); await seed('_story_publish_receipts', 'receipt', receipt());
  await deny('atomic client story plus forged receipt cannot bypass publication', () => {
    const batch = writeBatch(alice.firestore()); batch.set(ref(alice, 'stories', 'new-proof'), story()); batch.set(ref(alice, '_story_publish_receipts', 'new-proof'), receipt()); return batch.commit();
  });
  await allow('existing story view flow remains available for the viewer', () => setDoc(ref(alice, 'story_views', 'view'), { story_id: 'published', viewer_id: profile }));
  await deny('a viewer cannot forge another account view', () => setDoc(ref(bob, 'story_views', 'foreign-view'), { story_id: 'published', viewer_id: profile }));
  await seed('close_friends', 'grant', { user_id: profile, friend_id: 'story-bob-profile' });
  await deny('owner cannot create a new unverified legacy grant', () => setDoc(ref(alice, 'close_friends', 'new-grant'), { user_id: profile, friend_id: 'story-bob-profile' }));
  await allow('owner reads its own close-friend grant', () => getDoc(ref(alice, 'close_friends', 'grant')));
  for (const [name, context] of [['other', bob], ['guest', guest], ['admin', admin]]) {
    await deny(`${name} cannot read another close-friend grant`, () => getDoc(ref(context, 'close_friends', 'grant')));
    await deny(`${name} cannot delete another close-friend grant`, () => deleteDoc(ref(context, 'close_friends', 'grant')));
    await deny(`${name} cannot create an author grant`, () => setDoc(ref(context, 'close_friends', `grant-${name}`), { user_id: profile, friend_id: 'story-bob-profile' }));
  }
  await deny('other cannot steal a close-friend grant with new ownership', () => setDoc(ref(bob, 'close_friends', 'grant'), { user_id: 'story-bob-profile', friend_id: profile }));
  await deny('owner cannot mutate grant recipient', () => updateDoc(ref(alice, 'close_friends', 'grant'), { friend_id: 'somebody' }));
  await deny('owner cannot add unsupported authority fields', () => setDoc(ref(alice, 'close_friends', 'forged'), { user_id: profile, friend_id: 'story-bob-profile', admin: true }));
  await deny('owner cannot mutate legacy evidence outside verified management', () => deleteDoc(ref(alice, 'close_friends', 'grant')));
  await seed('close_friends', 'uid-grant', { user_id: uid, friend_id: 'story-bob' });
  await allow('unambiguous owner UID alias can read retained legacy reference', () => getDoc(ref(alice, 'close_friends', 'uid-grant')));
  await seed('profiles', uid, { user_id: 'story-bob' });
  await deny('UID profile collision cannot create a close-friend grant', () => setDoc(ref(alice, 'close_friends', 'collision'), { user_id: uid, friend_id: 'story-bob' }));
  await deny('UID profile collision cannot read a legacy aliased grant', () => getDoc(ref(alice, 'close_friends', 'uid-grant')));
  await seed('story_highlights', 'highlight', { owner_id: profile, cover_url: 'https://example.test/private.png', story_ids: ['published'] });
  await allow('highlight owner can inspect retained private covers', () => getDoc(ref(alice, 'story_highlights', 'highlight')));
  for (const [name, context] of [['other', bob], ['guest', guest], ['admin', admin]]) await deny(`${name} cannot inspect raw highlight covers`, () => getDoc(ref(context, 'story_highlights', 'highlight')));
  await deny('highlight owner cannot transfer ownership', () => updateDoc(ref(alice, 'story_highlights', 'highlight'), { owner_id: 'story-bob-profile' }));
  await seed('story_highlights', 'alias-highlight', { owner_id: uid, cover_url: 'https://example.test/private.png' });
  await deny('UID profile collision cannot read a highlight alias', () => getDoc(ref(alice, 'story_highlights', 'alias-highlight')));
  const mediaPath = `stories/${uid}/synthetic.png`;
  await allow('owner uploads its story media', () => uploadBytes(storageRef(alice.storage(), mediaPath), new Uint8Array([1, 2, 3]), { contentType: 'image/png' }));
  for (const [name, context] of [['owner', alice], ['admin', admin]]) {
    await allow(`${name} can read owned or administrative story bytes`, () => getBytes(storageRef(context.storage(), mediaPath)));
    await allow(`${name} can list owned or administrative story media`, () => listAll(storageRef(context.storage(), `stories/${uid}`)));
  }
  for (const [name, context] of [['other', bob], ['guest', guest]]) {
    await deny(`${name} cannot fetch private story bytes by known path`, () => getBytes(storageRef(context.storage(), mediaPath)));
    await deny(`${name} cannot enumerate private story media`, () => listAll(storageRef(context.storage(), `stories/${uid}`)));
  }
  console.log(`Story publication rules: ${checks} checks passed.`);
} finally { await env.cleanup(); }
