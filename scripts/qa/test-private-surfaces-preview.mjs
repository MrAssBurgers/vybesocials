import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Exact demo accounts and addresses only; no live credentials or provider calls.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { getStorage, connectStorageEmulator, uploadBytes, getDownloadURL, getBytes, ref } = await import('firebase/storage');
const { getFirestore, connectFirestoreEmulator, getDoc, setDoc, doc } = await import('firebase/firestore');
const { initializeApp: initAdmin, deleteApp: deleteAdmin } = await import('firebase-admin/app');
const { getFirestore: adminFirestore } = await import('firebase-admin/firestore');
const admin = initAdmin({ projectId: 'demo-vybe-preview', storageBucket: 'demo-vybe-preview.appspot.com' }, `private-preview-${randomUUID()}`);
const database = adminFirestore(admin), apps = [], checks = [], restores = [];
const serverId = 'qM6QxaRo0F31GmBiAJNN', channelId = 'nlyiDqM2x7wdO1HErUQ0';
const owner = name => `preview-${name}`, profile = name => `preview-profile-${name}`;
async function player(name) {
  assert.ok(['alice', 'bob'].includes(name));
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', appId: `demo-private-${name}`, storageBucket: 'demo-vybe-preview.appspot.com' }, `private-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', 9399);
  const firestore = getFirestore(app); connectFirestoreEmulator(firestore, '127.0.0.1', 8280);
  await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
  assert.equal(auth.currentUser.uid, owner(name));
  return { auth, functions, storage, firestore, call: async (fn, input) => (await httpsCallable(functions, fn)({ expectedOwnerUid: owner(name), ...input })).data };
}
async function preserve(path) {
  const ref = database.doc(path), previous = await ref.get();
  restores.push(() => previous.exists ? ref.set(previous.data()) : ref.delete());
  return ref;
}
const denied = action => assert.rejects(action, error => /permission-denied|unauthorized|failed-precondition/.test(error.code || ''));
try {
  const alice = await player('alice'), bob = await player('bob');
  assert.equal((await database.doc(`servers/${serverId}`).get()).data()?.owner_id, profile('alice'));
  assert.equal((await database.doc(`channels/${channelId}`).get()).data()?.server_id, serverId);
  const grant = await preserve(`community_admissions/${owner('bob')}/grants/${serverId}`);
  await grant.set({ auth_uid: owner('bob'), server_id: serverId, user_id: profile('bob'), active: true, role: 'member' });
  const bytes = await readFile(new URL('../../public/splash.png', import.meta.url));
  const reserveInput = { action: 'reserve', requestId: randomUUID(), channelId, byteSize: bytes.length, contentType: 'image/png', content: 'Local QA: private attachment, current members only.' };
  const reserved = await alice.call('communityAttachment', reserveInput);
  assert.equal((await alice.call('communityAttachment', reserveInput)).assetId, reserved.assetId);
  assert.equal((await alice.call('communityAttachment', { action: 'finalize', assetId: reserved.assetId })).uploadRequired, true);
  await denied(() => uploadBytes(ref(alice.storage, reserved.objectPath), bytes, { contentType: 'image/png' }));
  const uploadUrl = `http://127.0.0.1:5101/demo-vybe-preview/us-central1/communityAttachmentBytes/uploads/${reserved.assetId}`;
  const uploadHeaders = { Authorization: `Bearer ${await alice.auth.currentUser.getIdToken()}`, 'X-Vybe-Owner': owner('alice'), 'Content-Type': 'image/png' };
  const upload = await fetch(uploadUrl, { method: 'PUT', headers: uploadHeaders, body: bytes });
  assert.equal(upload.status, 200, await upload.text());
  const sent = await alice.call('communityAttachment', { action: 'finalize', assetId: reserved.assetId });
  assert.equal(sent.status, 'ready'); assert.equal(sent.message.attachment_id, reserved.assetId);
  assert.equal((await alice.call('communityAttachment', { action: 'finalize', assetId: reserved.assetId })).messageId, sent.messageId);
  checks.push('real Auth, reservation, private HTTP upload and replay publish one attachment; direct upload denied');
  const byteUrl = `http://127.0.0.1:5101/demo-vybe-preview/us-central1/communityAttachmentBytes/${sent.messageId}`;
  const headers = { Authorization: `Bearer ${await bob.auth.currentUser.getIdToken()}`, 'X-Vybe-Owner': owner('bob') };
  const read = await fetch(byteUrl, { headers });
  assert.equal(read.status, 200); assert.deepEqual(Buffer.from(await read.arrayBuffer()), bytes);
  const partial = await fetch(byteUrl, { headers: { ...headers, Range: 'bytes=0-7' } });
  assert.equal(partial.status, 206); assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(0, 8));
  assert.equal((await fetch(byteUrl, { method: 'HEAD', headers })).status, 200);
  checks.push('actual authenticated HTTP verifies full bytes, byte range and permission HEAD');
  assert.equal((await fetch(byteUrl)).status, 401);
  assert.equal((await fetch(byteUrl, { headers: { ...headers, 'X-Vybe-Owner': owner('alice') } })).status, 403);
  await denied(() => getBytes(ref(bob.storage, sent.objectPath)));
  await denied(() => getDownloadURL(ref(alice.storage, sent.objectPath)));
  await denied(() => getDoc(doc(alice.firestore, '_community_attachments', reserved.assetId)));
  checks.push('anonymous, wrong-owner, raw Storage and proof reads stay denied');
  await grant.update({ active: false });
  assert.equal((await fetch(byteUrl, { headers })).status, 403);
  assert.equal((await fetch(byteUrl, { method: 'HEAD', headers })).status, 403);
  checks.push('revoking membership denies the same GET and HEAD immediately at the server');
  await preserve(`profile_visibility/${profile('alice')}`);
  await setDoc(doc(alice.firestore, 'profile_visibility', profile('alice')), { fields: { bio: 'close_friends', posts: 'only_me', stories: 'friends' } });
  const input = { target_id: profile('alice'), expectedProfileId: profile('bob') };
  const visible = () => bob.call('resolveProfileVisibility', input);
  assert.equal((await visible()).fields.bio, false); assert.equal((await visible()).fields.posts, false);
  await alice.call('manageCloseFriends', { expectedProfileId: profile('alice'), action: 'add', friendId: profile('bob') });
  assert.equal((await visible()).fields.bio, true); assert.equal((await visible()).fields.posts, false);
  await alice.call('manageCloseFriends', { expectedProfileId: profile('alice'), action: 'remove', friendId: profile('bob') });
  assert.equal((await visible()).fields.bio, false);
  const self = await alice.call('resolveProfileVisibility', { target_id: profile('alice'), expectedProfileId: profile('alice') });
  assert.equal(self.isSelf, true); assert.equal(self.fields.posts, true);
  await denied(() => getDoc(doc(bob.firestore, 'profile_visibility', profile('alice'))));
  await denied(() => alice.call('resolveProfileVisibility', { target_id: profile('alice'), expectedProfileId: profile('alice'), expectedOwnerUid: owner('bob') }));
  checks.push('current Close Friends grants govern profile sections; Only me, self and owner settings are enforced');
  const output = new URL('../../work/local-preview/private-qa/', import.meta.url);
  await mkdir(output, { recursive: true });
  await writeFile(new URL('latest.json', output), JSON.stringify({ project: 'demo-vybe-preview', messageId: sent.messageId, checks }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, checks, retainedMessageId: sent.messageId }, null, 2));
} finally {
  for (const restore of restores.reverse()) await restore();
  await Promise.all(apps.map(app => deleteApp(app))); await deleteAdmin(admin);
}
