import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Refuse all other environments before importing Firebase or opening a connection.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');

const bucket = 'demo-vybe-preview.appspot.com';
const latest = JSON.parse(await readFile(new URL('../../work/local-preview/game-sdk/latest-capture.json', import.meta.url), 'utf8'));
assert.equal(latest.project, 'demo-vybe-preview'); assert.match(latest.captureId, /^[a-f0-9]{48}$/);
const allowedOrigins = new Set([9199, 5101, 9399, 8082].map(port => `http://127.0.0.1:${port}`));
const nativeFetch = globalThis.fetch;
const sessions = [];
// The actual Node SDK uses fetch. Observe upload response headers without
// printing bearer credentials, resumable session IDs, query strings or bodies.
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  assert.ok(allowedOrigins.has(url.origin), 'Fixture refused a non-demo endpoint');
  const response = await nativeFetch(input, { ...init, redirect: 'error' });
  const uploadSession = response.headers.get('x-goog-upload-url');
  if (uploadSession) {
    const session = new URL(uploadSession);
    assert.equal(session.origin, url.origin, 'Resumable upload escaped its original transport');
    assert.equal(session.pathname, `/v0/b/${bucket}/o`);
    assert.equal(session.searchParams.get('upload_protocol'), 'resumable');
    assert.ok(session.searchParams.has('upload_id'));
    sessions.push(session.origin);
  }
  return response;
};

const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { getStorage, connectStorageEmulator, getBytes, getMetadata, ref, uploadBytes, uploadBytesResumable, deleteObject } = await import('firebase/storage');
const apps = [], objects = [], checks = [];

async function player(name, port) {
  assert.ok(['alice', 'bob', 'guest'].includes(name)); assert.ok([9399, 8082].includes(port));
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', storageBucket: bucket, appId: 'demo-storage-proxy' }, `storage-qa-${name}-${port}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const storage = getStorage(app); connectStorageEmulator(storage, '127.0.0.1', port);
  storage.maxUploadRetryTime = 5000; storage.maxOperationRetryTime = 5000;
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  if (name !== 'guest') {
    await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
    assert.equal(auth.currentUser.uid, `preview-${name}`);
  }
  return { app, storage, functions };
}

try {
  const direct = await player('alice', 9399), proxy = await player('alice', 8082);
  const { data: capture } = await httpsCallable(direct.functions, 'getGameCapture', { timeout: 15000 })({ captureId: latest.captureId });
  assert.equal(capture.status, 'ready'); assert.equal(capture.storagePath, `game-captures/preview-alice/${latest.captureId}`);
  const directBytes = new Uint8Array(await getBytes(ref(direct.storage, capture.storagePath), 48 * 1024 * 1024));
  const proxyBytes = new Uint8Array(await getBytes(ref(proxy.storage, capture.storagePath), 48 * 1024 * 1024));
  assert.equal(directBytes.byteLength, capture.byteSize); assert.deepEqual(proxyBytes, directBytes);
  checks.push('private capture downloads through direct and proxy Storage with identical bytes');
  const metadata = await getMetadata(ref(proxy.storage, capture.storagePath));
  assert.equal(metadata.contentType, capture.contentType); assert.equal(metadata.size, capture.byteSize);
  checks.push('proxy preserves real private object metadata');

  for (const name of ['bob', 'guest']) {
    const other = await player(name, 8082);
    await assert.rejects(getBytes(ref(other.storage, capture.storagePath), 48 * 1024 * 1024), error => error.code === 'storage/unauthorized');
    checks.push(`${name} cannot read Alice's private capture through the proxy`);
  }

  for (const [transport, client] of [['direct', direct], ['proxy', proxy]]) {
    for (const resumable of [false, true]) {
      // Temporary synthetic files, never attached to a profile or published.
      // Padding forces the SDK's resumable branch; this checks byte transport,
      // not codecs or rendered image validity.
      const media = resumable ? new Uint8Array(768 * 1024) : directBytes;
      if (resumable) media.set(directBytes.subarray(0, Math.min(directBytes.length, media.length)));
      const object = ref(client.storage, `avatars/preview-alice/local-preview-storage-${randomUUID()}.png`);
      objects.push(object);
      if (resumable) await uploadBytesResumable(object, media, { contentType: 'image/png' });
      else await uploadBytes(object, media, { contentType: 'image/png' });
      assert.deepEqual(new Uint8Array(await getBytes(object, media.byteLength + 1)), media);
      checks.push(`${transport} ${resumable ? 'resumable' : 'multipart'} upload round-trips identical bytes`);
    }
  }
  assert.ok(sessions.includes('http://127.0.0.1:9399'));
  assert.ok(sessions.includes('http://127.0.0.1:8082'));
  checks.push('direct and proxy resumable session URLs remain on their original exact loopback origin');
  // Explicitly prove client-authorized cleanup instead of silently leaving files.
  for (const object of objects) await deleteObject(object);
  objects.length = 0;
  checks.push('all temporary upload objects deleted through the authenticated client');
  console.log(JSON.stringify({ project: 'demo-vybe-preview', checks, count: checks.length }, null, 2));
} finally {
  await Promise.all(objects.map(object => deleteObject(object).catch(() => {})));
  await Promise.all(apps.map(app => deleteApp(app)));
  globalThis.fetch = nativeFetch;
}
