import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const projectId = process.env.GCLOUD_PROJECT;
assert.match(projectId || '', /^demo-[a-z0-9-]+$/);
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) assert.match(process.env[name] || '', /^(127\.0\.0\.1|localhost):\d+$/);
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId, storageBucket: `${projectId}.appspot.com` });
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getMetadata, getDownloadURL, getBytes, deleteObject } = require('firebase/storage');
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':'), [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({ projectId, firestore: { host, port: Number(port), rules: await readFile(process.env.FIRESTORE_RULES_FILE || path.join(root, 'firestore.rules'), 'utf8') }, storage: { host: storageHost, port: Number(storagePort), rules: await readFile(process.env.STORAGE_RULES_FILE || path.join(root, 'storage.rules'), 'utf8') } });
const { db } = await import('../functions/lib/_shared/admin.js');
const { getStorage } = await import('../functions/node_modules/firebase-admin/lib/storage/index.js');
const { runUploadSound, runReadSoundLibrary, uploadSound } = await import('../functions/lib/soundUpload.js');
const { inspectSound } = await import('../functions/lib/_shared/soundInspection.js');
const alice = 'sound-alice', bob = 'sound-bob', profile = uid => `profile-${uid}`;
const client = env.authenticatedContext(alice), outsider = env.authenticatedContext(bob), staff = env.authenticatedContext('sound-admin', { admin: true });
let groups = 0, rules = 0, sequence = 0;
const check = async (name, run) => { await run(); groups++; console.log(`PASS ${name}`); };
const deny = async run => { await assertFails(run()); rules++; };
const allow = async run => { await assertSucceeds(run()); rules++; };
function wav(seconds = 0.5) { const pcm = Buffer.alloc(Math.round(seconds * 44100) * 2); for (let i = 0; i < pcm.length / 2; i++) pcm.writeInt16LE(Math.round(Math.sin(i * Math.PI * 2 * 440 / 44100) * 1000), i * 2); const head = Buffer.alloc(44); head.write('RIFF'); head.writeUInt32LE(pcm.length + 36, 4); head.write('WAVEfmt ', 8); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22); head.writeUInt32LE(44100, 24); head.writeUInt32LE(88200, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34); head.write('data', 36); head.writeUInt32LE(pcm.length, 40); return Buffer.concat([head, pcm]); }
const bytes = wav(), sha = value => createHash('sha256').update(value).digest('hex');
const payload = (uid, action, extra = {}) => ({ action, expectedOwnerUid: uid, expectedProfileId: profile(uid), ...extra });
const call = (action, extra, decode) => runUploadSound(db, alice, payload(alice, action, extra), decode);
const reserve = (extra = {}) => call('reserve', { requestId: `fixture-${sequence++}`, title: 'Synthetic original tone', tags: ['fixture'], byteSize: bytes.length, contentType: 'audio/wav', sha256: sha(bytes), publicConsent: true, ...extra });
const library = extra => runReadSoundLibrary(db, bob, payload(bob, 'list', { kind: 'new', ...extra }));
const upload = (row, value = bytes) => uploadBytes(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath), value, { contentType: 'audio/wav' });
try {
  await env.clearFirestore();
  for (const uid of [alice, bob]) { await db.doc(`profiles/${profile(uid)}`).set({ user_id: uid, username: uid }); await db.doc(`user_auth_index/${uid}`).set({ profile_id: profile(uid) }); }
  await check('real decoder accepts synthetic audio and rejects malformed, mismatched and overlong input', async () => {
    const decoded = await inspectSound(bytes, 'audio/wav'); assert.equal(decoded.duration, 0.5); assert.equal(decoded.bytes.toString('ascii', 0, 4), 'RIFF');
    await assert.rejects(inspectSound(bytes, 'audio/mpeg'), { code: 'invalid-argument' });
    await assert.rejects(inspectSound(Buffer.alloc(200), 'audio/wav'), { code: 'invalid-argument' });
    await assert.rejects(inspectSound(Buffer.from('RIFFxxxxxxxxWAVE' + 'x'.repeat(100)), 'audio/wav'), { code: 'invalid-argument' });
    await assert.rejects(inspectSound(wav(60.1), 'audio/wav'), { code: 'invalid-argument' });
  });
  await check('requires authenticated strict canonical actor, public consent and bounded metadata', async () => {
    await assert.rejects(uploadSound.run({ data: {} }), { code: 'unauthenticated' });
    await assert.rejects(reserve({ publicConsent: false }), { code: 'invalid-argument' }); await assert.rejects(reserve({ byteSize: 21 * 1024 * 1024 }), { code: 'invalid-argument' });
    await assert.rejects(reserve({ title: 'x'.repeat(101) }), { code: 'invalid-argument' }); await assert.rejects(reserve({ expectedOwnerUid: bob }), { code: 'failed-precondition' });
    await db.doc(`profiles/${alice}`).set({ user_id: bob }); await assert.rejects(reserve(), { code: 'failed-precondition' }); await db.doc(`profiles/${alice}`).delete();
  });
  const row = await reserve({ requestId: 'stable-request' });
  await check('reservation is idempotent and clients cannot forge proof or publication fields', async () => {
    const same = await reserve({ requestId: 'stable-request' }); assert.equal(same.uploadId, row.uploadId);
    await assert.rejects(reserve({ requestId: 'stable-request', title: 'changed' }), { code: 'already-exists' });
    for (const context of [client, outsider, staff, env.unauthenticatedContext()]) for (const collection of ['sounds', '_sound_uploads', '_sound_upload_limits', '_sound_library_cursors']) {
      await deny(() => getDoc(doc(context.firestore(), collection, row.uploadId))); await deny(() => setDoc(doc(context.firestore(), collection, row.uploadId), { owner_uid: alice, status: 'published' }));
      await deny(() => updateDoc(doc(context.firestore(), collection, row.uploadId), { owner_uid: bob })); await deny(() => deleteDoc(doc(context.firestore(), collection, row.uploadId)));
    }
  });
  await check('Storage accepts only exact reserved immutable owner bytes, not guessed paths or mismatched metadata', async () => {
    await deny(() => uploadBytes(ref(outsider.storage(`gs://${projectId}.appspot.com`), row.sourcePath), bytes, { contentType: 'audio/wav' }));
    await deny(() => uploadBytes(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath), bytes.subarray(0, 100), { contentType: 'audio/wav' }));
    await deny(() => uploadBytes(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath), bytes, { contentType: 'audio/mpeg' }));
    await allow(() => upload(row)); await deny(() => upload(row));
    await deny(() => getMetadata(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath))); await deny(() => getDownloadURL(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath))); await deny(() => deleteObject(ref(client.storage(`gs://${projectId}.appspot.com`), row.sourcePath)));
  });
  let published;
  await check('real finalize validates bytes and publishes one normalized durable sound', async () => {
    published = await call('finalize', { uploadId: row.uploadId }); assert.equal(published.status, 'published');
    const sound = (await db.doc(`sounds/${row.uploadId}`).get()).data(), proof = (await db.doc(`_sound_uploads/${row.uploadId}`).get()).data();
    assert.equal(sound.duration, 0.5); assert.equal(sound.moderation_status, 'not_reviewed'); assert.equal(proof.status, 'published');
    const [media] = await getStorage().bucket().file(proof.object_path).download(); assert.equal(media.length, 44 + 0.5 * 44100 * 4);
    assert.equal((await call('finalize', { uploadId: row.uploadId })).soundId, row.uploadId); assert.equal((await db.collection('sounds').get()).size, 1);
    await deny(() => uploadBytes(ref(client.storage(`gs://${projectId}.appspot.com`), proof.object_path), bytes, { contentType: 'audio/wav' }));
    await allow(() => getBytes(ref(outsider.storage(`gs://${projectId}.appspot.com`), proof.object_path)));
  });
  await check('library verifies protected proof, current moderation, bilateral blocks and ownership', async () => {
    assert.equal((await library()).sounds[0].sound_id, row.uploadId);
    await db.doc('sounds/forged-old').set({ is_approved: true, uploader_id: profile(alice) }); assert.equal((await library()).sounds.length, 1);
    await db.doc('blocked_users/sound-fixture').set({ blocker_id: profile(alice), blocked_id: bob }); assert.deepEqual((await library()).sounds, []); await db.doc('blocked_users/sound-fixture').delete();
    await db.doc(`sounds/${row.uploadId}`).update({ moderation_status: 'removed' }); assert.deepEqual((await library()).sounds, []); await assert.rejects(call('finalize', { uploadId: row.uploadId }), { code: 'failed-precondition' });
    await db.doc(`sounds/${row.uploadId}`).update({ moderation_status: 'not_reviewed' });
    assert.deepEqual((await runReadSoundLibrary(db, bob, payload(bob, 'list', { kind: 'mine' }))).sounds, []);
  });
  await check('deleting canonical sound consumes its old publication receipt without recreation', async () => {
    await db.doc(`sounds/${row.uploadId}`).delete(); await assert.rejects(call('finalize', { uploadId: row.uploadId }), { code: 'failed-precondition' });
    await assert.rejects(reserve({ requestId: 'stable-request' }), { code: 'failed-precondition' }); assert.equal((await db.doc(`sounds/${row.uploadId}`).get()).exists, false);
  });
  await check('cancellation blocks uploads and cannot publish during a delayed inspection', async () => {
    const cancelled = await reserve(); await call('cancel', { uploadId: cancelled.uploadId }); await deny(() => upload(cancelled));
    const delayed = await reserve(); await upload(delayed);
    let release; const wait = new Promise(resolve => { release = resolve; }); let entered; const started = new Promise(resolve => { entered = resolve; });
    const pending = call('finalize', { uploadId: delayed.uploadId }, async () => { entered(); await wait; return inspectSound(bytes, 'audio/wav'); }); await started;
    await call('cancel', { uploadId: delayed.uploadId }); release(); await assert.rejects(pending, { code: 'failed-precondition' }); assert.equal((await db.doc(`sounds/${delayed.uploadId}`).get()).exists, false);
  });
  await check('simultaneous finalization does not duplicate a post or normalized object', async () => {
    const race = await reserve(); await upload(race); const results = await Promise.all([call('finalize', { uploadId: race.uploadId }), call('finalize', { uploadId: race.uploadId })]);
    assert.ok(results.some(value => value.status === 'published')); assert.equal((await call('status', { uploadId: race.uploadId })).status, 'published');
    const [objects] = await getStorage().bucket().getFiles({ prefix: `original-sounds/${alice}/${race.uploadId}/` }); assert.equal(objects.length, 1);
  });
  await check('wrong checksum cannot publish and expired reservation cannot accept bytes', async () => {
    const wrong = await reserve({ sha256: '0'.repeat(64) }); await upload(wrong); await assert.rejects(call('finalize', { uploadId: wrong.uploadId }), { code: 'invalid-argument' });
    const expired = await reserve(); await db.doc(`_sound_uploads/${expired.uploadId}`).update({ expires_at_ms: Date.now() - 1 }); await deny(() => upload(expired)); await assert.rejects(call('finalize', { uploadId: expired.uploadId }), { code: 'failed-precondition' });
  });
  await check('opaque pagination binds viewer and scope, hides rejected candidates and expires', async () => {
    const existing = (await db.collection('_sound_uploads').where('status', '==', 'published').get()).docs[0], proof = existing.data(), sound = (await db.doc(`sounds/${existing.id}`).get()).data();
    for (let index = 0; index < 28; index++) { const id = sha(`library-${index}`), object = `original-sounds/${alice}/${id}/fixture.wav`; await db.doc(`_sound_uploads/${id}`).set({ ...proof, upload_id: id, source_path: `sound-uploads/${alice}/${id}/source`, object_path: object, published_at_ms: Date.now() + index }); await db.doc(`sounds/${id}`).set({ ...sound, sound_id: id, object_path: object }); }
    await db.doc('blocked_users/library-block').set({ blocker_id: bob, blocked_id: profile(alice) });
    const blocked = await library(); assert.deepEqual(blocked.sounds, []); assert.match(blocked.nextCursor, /^[a-f0-9]{32}$/); assert.equal((await db.doc(`_sound_uploads/${blocked.nextCursor}`).get()).exists, false);
    await assert.rejects(library({ kind: 'mine', cursor: blocked.nextCursor }), { code: 'failed-precondition' });
    await assert.rejects(runReadSoundLibrary(db, alice, payload(alice, 'list', { kind: 'new', cursor: blocked.nextCursor })), { code: 'failed-precondition' });
    await db.doc('blocked_users/library-block').delete(); const next = await library({ cursor: blocked.nextCursor }); assert.ok(next.sounds.length > 0 && next.sounds.length < 25);
    await db.doc(`_sound_library_cursors/${blocked.nextCursor}`).update({ expires_at_ms: 0 }); await assert.rejects(library({ cursor: blocked.nextCursor }), { code: 'failed-precondition' });
  });
  await check('expired unpublished and cancelled receipts remain recoverable, quotas stay bounded', async () => {
    const item = await reserve({ requestId: 'expired-recoverable' }); await db.doc(`_sound_uploads/${item.uploadId}`).update({ expires_at_ms: 0 });
    assert.equal((await reserve({ requestId: 'expired-recoverable' })).status, 'expired'); assert.equal((await call('status', { uploadId: item.uploadId })).status, 'expired');
    await call('cancel', { uploadId: item.uploadId }); assert.equal((await reserve({ requestId: 'expired-recoverable' })).status, 'cancelled');
    await db.doc(`_sound_upload_limits/${alice}`).set({ day: new Date().toISOString().slice(0, 10), count: 20, bytes: 100 }); await assert.rejects(reserve(), { code: 'resource-exhausted' });
  });
  console.log(`Sound upload: ${groups} backend groups, ${rules} rules checks passed.`);
} finally { await env.cleanup(); await db.terminate(); }
