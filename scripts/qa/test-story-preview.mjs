import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';

// Test accounts and fixed local emulator addresses only. Never production.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { getStorage, connectStorageEmulator, uploadBytes, getDownloadURL, getBytes, ref, listAll } = await import('firebase/storage');
const { getFirestore, connectFirestoreEmulator, getDoc, deleteDoc, setDoc, doc } = await import('firebase/firestore');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const apps = [], checks = [];
const admin = initAdmin({ projectId: 'demo-vybe-preview', storageBucket: 'demo-vybe-preview.appspot.com' }, `story-seed-${randomUUID()}`);
const database = adminFirestore(admin);
const profile = name => `preview-profile-${name}`;
const owner = name => `preview-${name}`;
async function player(name) {
  assert.ok(['alice', 'bob'].includes(name));
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', appId: `demo-story-${name}`, storageBucket: 'demo-vybe-preview.appspot.com' }, `story-fixture-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9399);
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8280);
  await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
  assert.equal(auth.currentUser.uid, owner(name));
  const call = async (functionName, input) => (await httpsCallable(functions, functionName)({ expectedOwnerUid: owner(name), expectedProfileId: profile(name), ...input })).data;
  return { app, functions, storage, firestore, call };
}
const denied = async action => assert.rejects(action, error => /permission-denied|unauthorized|failed-precondition/.test(error.code || ''));
try {
  const alice = await player('alice'), bob = await player('bob');
  // Seed only the two explicitly synthetic identities' accepted friendship.
  // All feature calls and Storage/rules assertions below use actual client Auth.
  for (const name of ['alice', 'bob']) assert.equal((await database.collection('profiles').doc(profile(name)).get()).data()?.user_id, owner(name));
  await database.collection('friend_requests').doc('preview-story-friend-alice-bob').set({ sender_id: profile('alice'), receiver_id: profile('bob'), status: 'accepted', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const path = `stories/${owner('alice')}/preview-${randomUUID()}.png`;
  const object = ref(alice.storage, path);
  await uploadBytes(object, bytes, { contentType: 'image/png' });
  const mediaUrl = await getDownloadURL(object);
  const requestId = `preview-story-${randomUUID()}`;
  const publish = { requestId, expectedOwnerUid: owner('alice'), mediaUrl, mediaType: 'image', caption: 'Synthetic private story: local preview only', isCloseFriendsOnly: true, aspectRatio: 1, duration: null };
  const publishCall = httpsCallable(alice.functions, 'publishStory');
  const first = (await publishCall(publish)).data;
  assert.equal(first.created, true); assert.equal(first.status, 'published');
  const again = (await publishCall(publish)).data;
  assert.equal(again.storyId, first.storyId); assert.equal(again.created, false);
  checks.push('authenticated publish and identical request replay keep one story');
  await denied(() => httpsCallable(alice.functions, 'publishStory')({ ...publish, expectedOwnerUid: owner('bob') }));
  checks.push('publish rejects a mismatched expected owner');
  const owned = await alice.call('listVisibleStories', { storyIds: [first.storyId] });
  assert.deepEqual(owned.stories.map(story => story.id), [first.storyId]);
  const noGrant = await bob.call('listVisibleStories', { storyIds: [first.storyId] });
  assert.deepEqual(noGrant.stories, []);
  checks.push('ordinary friendship does not grant Close Friends story access');
  await alice.call('manageCloseFriends', { action: 'add', friendId: profile('bob') });
  const allowed = await bob.call('listVisibleStories', { storyIds: [first.storyId] });
  assert.deepEqual(allowed.stories.map(story => story.id), [first.storyId]);
  const response = await fetch(allowed.stories[0].media_url);
  assert.equal(response.ok, true); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  checks.push('fresh owner-approved grant admits the intended viewer and actual media bytes');
  await alice.call('manageCloseFriends', { action: 'remove', friendId: profile('bob') });
  assert.deepEqual((await bob.call('listVisibleStories', { storyIds: [first.storyId] })).stories, []);
  checks.push('removing the grant hides the same story on the next authorized read');
  await denied(() => getDoc(doc(bob.firestore, 'stories', first.storyId)));
  await denied(() => setDoc(doc(alice.firestore, 'stories', `forged-${randomUUID()}`), first.story));
  await denied(() => getBytes(ref(bob.storage, path)));
  await denied(() => listAll(ref(bob.storage, `stories/${owner('alice')}`)));
  checks.push('direct record writes, foreign record reads and foreign Storage reads/listings are denied');
  await deleteDoc(doc(alice.firestore, 'stories', first.storyId));
  const deleted = (await publishCall(publish)).data;
  assert.equal(deleted.status, 'deleted'); assert.equal(deleted.created, false); assert.equal(deleted.story, null);
  checks.push('owner deletion consumes the receipt; retry never reposts it');
  const visible = (await publishCall({ ...publish, requestId: `preview-story-visible-${randomUUID()}` })).data;
  assert.equal(visible.created, true);
  const output = new URL('../../work/local-preview/story-qa/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('latest-story.json', output), JSON.stringify({ project: 'demo-vybe-preview', storyId: visible.storyId, ownerUid: owner('alice'), mediaPath: path, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, retainedPrivateStoryId: visible.storyId }, null, 2));
} finally {
  await Promise.all(apps.map(app => deleteApp(app))); await deleteAdmin(admin);
}
