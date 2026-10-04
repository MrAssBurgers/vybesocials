import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

// Refuse all other targets before loading a Firebase SDK. There is no production
// fallback, Admin SDK, provider stub, service credential, or browser interaction.
assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');

const repo = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(repo, 'work', 'local-preview', 'game-sdk');
await mkdir(output, { recursive: true });
const { build } = await import('esbuild');
// Compile the actual first-party adapter; keep Firebase external so the fixture
// and adapter share the exact same initialized client SDK instances.
const built = path.join(output, 'firebase-client.mjs');
await build({ entryPoints: [path.join(repo, 'sdk/game/firebase.ts')], outfile: built, bundle: true, platform: 'node', format: 'esm', packages: 'external', logLevel: 'silent' });
const { createFirebaseGameClient } = await import(pathToFileURL(built).href);
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator } = await import('firebase/functions');
const { getStorage, connectStorageEmulator, getBytes, ref } = await import('firebase/storage');
const apps = [];
const outcomes = [];

async function player(name) {
  assert.ok(['alice', 'bob'].includes(name));
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', appId: `demo-game-${name}`, storageBucket: 'demo-vybe-preview.appspot.com' }, `game-fixture-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5101);
  connectStorageEmulator(getStorage(app), '127.0.0.1', 9399);
  await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
  assert.equal(auth.currentUser.uid, `preview-${name}`);
  return { app, client: createFirebaseGameClient(app) };
}

// A real decodable synthetic PNG, generated entirely locally for visual review.
function png() {
  const width = 480, height = 270, scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = y * (1 + width * 4) + 1 + x * 4;
    const lane = Math.abs(x - width / 2) < 12 || (y > 120 && Math.abs(x - width / 2) < (y - 100) * 1.1 && y % 24 < 2);
    const car = y > 185 && y < 237 && x > 211 && x < 269;
    scanlines.set(car ? [245, 80, 185, 255] : lane ? [55, 230, 240, 255] : [24 + Math.floor(y / 6), 15 + Math.floor(x / 20), 65 + Math.floor(y / 3), 255], offset);
  }
  const crc = bytes => {
    let value = 0xffffffff;
    for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, data) => {
    const type = Buffer.from(name), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
    length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc(Buffer.concat([type, data])));
    return Buffer.concat([length, type, data, checksum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))]));
}

try {
  const alice = await player('alice');
  const media = png(), key = `local-preview-${randomUUID()}`, phases = [];
  let allocated = '';
  const input = { gameId: 'preview-game', idempotencyKey: key, contentType: 'image/png', media, caption: 'Synthetic local game capture — emulator review only', tags: ['localpreview'], onCaptureReserved: id => { allocated = id; }, onPhase: phase => phases.push(phase) };
  const ready = await alice.client.stageCapture(input);
  assert.equal(ready.status, 'ready'); assert.equal(allocated, ready.captureId);
  assert.deepEqual(phases, ['preparing', 'verifying', 'uploading', 'verifying', 'ready']); outcomes.push('actual authenticated SDK upload and server verification');
  const downloaded = await getBytes(ref(getStorage(alice.app), ready.storagePath), 48 * 1024 * 1024);
  assert.deepEqual(new Uint8Array(downloaded), media); outcomes.push('owner-authenticated Storage download matches uploaded PNG');
  const replay = await alice.client.stageCapture(input);
  assert.equal(replay.captureId, ready.captureId); assert.equal(replay.status, 'ready'); outcomes.push('same-key SDK replay returns the original ready capture');
  const bob = await player('bob');
  await assert.rejects(bob.client.getCapture(ready.captureId), error => error.code === 'functions/not-found'); outcomes.push('other account cannot inspect the private capture');
  const cancel = new AbortController(); let cancelledId = '';
  await assert.rejects(alice.client.stageCapture({ ...input, idempotencyKey: `local-cancel-${randomUUID()}`, signal: cancel.signal, onCaptureReserved: id => { cancelledId = id; cancel.abort(); }, onPhase: undefined }), /cancelled/);
  assert.match(cancelledId, /^[a-f0-9]{48}$/);
  assert.deepEqual(await alice.client.discardCapture(cancelledId), { ok: true });
  assert.deepEqual(await alice.client.discardCapture(cancelledId), { ok: true });
  await assert.rejects(alice.client.getCapture(cancelledId), error => error.code === 'functions/failed-precondition'); outcomes.push('early draft ID permits explicit idempotent discard after cancellation');
  const result = { project: 'demo-vybe-preview', captureId: ready.captureId, reviewUrl: `http://127.0.0.1:8082/game-capture/${ready.captureId}`, status: ready.status, checks: outcomes };
  await writeFile(path.join(output, 'latest-capture.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.all(apps.map(app => deleteApp(app)));
}
