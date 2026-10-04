import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_STORAGE_EMULATOR_HOST']) {
  assert.match(process.env[name] || '', /^(127\.0\.0\.1|localhost):\d+$/, `${name} must use an isolated local emulator`);
}
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, query, where, limit, updateDoc, deleteDoc, writeBatch } = require('firebase/firestore');
const { ref, uploadBytes, getBytes, deleteObject } = require('firebase/storage');
const [firestoreHost, firestorePort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const [storageHost, storagePort] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');
const env = await initializeTestEnvironment({
  projectId,
  firestore: { host: firestoreHost, port: Number(firestorePort), rules: await readFile('firestore.rules', 'utf8') },
  storage: { host: storageHost, port: Number(storagePort), rules: await readFile('storage.rules', 'utf8') },
});
let checks = 0;
async function allowed(label, fn) { await assertSucceeds(fn()); checks++; console.log(`PASS ${label}`); }
async function denied(label, fn) { await assertFails(fn()); checks++; console.log(`PASS ${label}`); }
const uid = 'sound-alice', bobUid = 'sound-bob';
const profile = 'sound-profile-alice', bobProfile = 'sound-profile-bob';
const alice = env.authenticatedContext(uid), bob = env.authenticatedContext(bobUid);
const guest = env.unauthenticatedContext(), admin = env.authenticatedContext('sound-admin', { admin: true });
const now = '2026-10-04T06:00:00.000Z';
const sound = (owner, type = 'message_tone') => ({
  user_id: owner, sound_type: type, file_url: 'https://storage.example.test/tone.wav?token=fixture',
  file_name: 'Fixture tone.wav', duration_seconds: 0.5, created_at: now, updated_at: now,
});

try {
  await env.clearFirestore(); await env.clearStorage();
  await env.withSecurityRulesDisabled(async context => {
    for (const [id, user] of [[profile, uid], [bobProfile, bobUid]]) {
      await setDoc(doc(context.firestore(), 'profiles', id), { user_id: user });
      await setDoc(doc(context.firestore(), 'user_auth_index', user), { profile_id: id });
    }
    await setDoc(doc(context.firestore(), 'user_custom_sounds', 'legacy-sound-id'), { ...sound(profile, 'call_ringtone'), id: 'legacy-sound-id', migration_note: 'Retained legacy field' });
  });
  const tone = (context, id) => doc(context.firestore(), 'user_custom_sounds', id);
  for (const owner of [uid, profile]) {
    const id = `${owner}_message_tone`;
    await denied(`${owner} namespace cannot be preallocated by another account`, () => setDoc(tone(bob, id), sound(bobUid)));
    await allowed(`${owner} owner creates canonical tone metadata`, () => setDoc(tone(alice, id), { ...sound(owner), id }));
    await allowed(`${owner} owner reads metadata`, () => getDoc(tone(alice, id)));
    await allowed(`${owner} owner query supports library and compatibility upsert`, () => getDocs(query(collection(alice.firestore(), 'user_custom_sounds'), where('user_id', '==', owner), where('sound_type', '==', 'message_tone'), limit(5))));
    await denied(`${owner} another account cannot read metadata or bearer URL`, () => getDoc(tone(bob, id)));
    await denied(`${owner} guest cannot read metadata`, () => getDoc(tone(guest, id)));
    await denied(`${owner} another account cannot overwrite and claim an existing tone`, () => setDoc(tone(bob, id), { ...sound(bobUid), id }));
    await denied(`${owner} owner cannot transfer tone to another UID`, () => updateDoc(tone(alice, id), { user_id: bobUid }));
    await denied(`${owner} owner cannot transfer tone to another profile`, () => updateDoc(tone(alice, id), { user_id: bobProfile }));
    await denied(`${owner} admin cannot transfer stored ownership`, () => updateDoc(tone(admin, id), { user_id: bobUid }));
    await denied(`${owner} tone kind is immutable`, () => updateDoc(tone(alice, id), { sound_type: 'call_ringtone' }));
    await denied(`${owner} another account cannot delete tone`, () => deleteDoc(tone(bob, id)));
    await allowed(`${owner} owner can replace its sound`, () => updateDoc(tone(alice, id), { file_name: 'Replacement.wav', duration_seconds: 5 }));
  }
  await denied('even an owned UID-to-profile alias transfer is rejected', () => updateDoc(tone(alice, `${uid}_message_tone`), { user_id: profile }));
  await denied('unfiltered custom-tone enumeration is rejected', () => getDocs(collection(bob.firestore(), 'user_custom_sounds')));
  await denied('another owner-filtered library cannot be queried', () => getDocs(query(collection(bob.firestore(), 'user_custom_sounds'), where('user_id', '==', profile))));
  await denied('guest cannot create a tone', () => setDoc(tone(guest, 'guest_message_tone'), sound('guest')));
  await denied('new arbitrary-ID custom-tone rows are rejected', () => setDoc(tone(alice, 'arbitrary-tone'), sound(uid)));
  await allowed('legacy arbitrary-ID tone remains readable by its verified profile owner', () => getDoc(tone(alice, 'legacy-sound-id')));
  await allowed('actual compatibility query plus merge batch updates a migrated row', async () => {
    const rows = await getDocs(query(collection(alice.firestore(), 'user_custom_sounds'), where('user_id', '==', profile), where('sound_type', '==', 'call_ringtone'), limit(5)));
    assert.equal(rows.size, 1); assert.equal(rows.docs[0].id, 'legacy-sound-id');
    const batch = writeBatch(alice.firestore());
    batch.set(tone(alice, rows.docs[0].id), { ...sound(profile, 'call_ringtone'), id: rows.docs[0].id, file_name: 'Legacy replacement.wav' }, { merge: true });
    await batch.commit();
    assert.equal((await getDoc(tone(alice, rows.docs[0].id))).data().migration_note, 'Retained legacy field');
  });
  await denied('another account cannot take over a known legacy row', () => setDoc(tone(bob, 'legacy-sound-id'), { ...sound(bobUid, 'call_ringtone'), id: 'legacy-sound-id' }));
  await denied('legacy fields cannot be added or modified by the browser', () => updateDoc(tone(alice, 'legacy-sound-id'), { migration_note: 'Rewritten' }));
  for (const [label, patch] of [
    ['missing owner', { user_id: null }], ['wrong type', { sound_type: 'system' }],
    ['empty URL', { file_url: '' }], ['oversized URL', { file_url: 'x'.repeat(4097) }],
    ['empty filename', { file_name: '' }], ['oversized filename', { file_name: 'x'.repeat(256) }],
    ['non-numeric duration', { duration_seconds: '3' }], ['zero duration', { duration_seconds: 0 }],
    ['negative duration', { duration_seconds: -1 }], ['NaN duration', { duration_seconds: Number.NaN }],
    ['long message tone', { duration_seconds: 5.01 }], ['infinite message tone', { duration_seconds: Infinity }],
    ['forged document ID', { id: 'other' }], ['extra privilege field', { admin: true }],
    ['unbounded metadata time', { updated_at: 'x'.repeat(41) }],
  ]) await denied(`metadata rejects ${label}`, () => updateDoc(tone(alice, `${uid}_message_tone`), patch));
  await allowed('admin can inspect a tone without transferring its owner', () => getDoc(tone(admin, 'legacy-sound-id')));
  await allowed('legacy owner can remove a tone', () => deleteDoc(tone(alice, 'legacy-sound-id')));
  await allowed('admin can remove an existing tone', () => deleteDoc(tone(admin, `${uid}_message_tone`)));

  const bytes = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 65, 86, 69]);
  const storageRef = (context, fileName = 'message_tone.wav', owner = uid) => ref(context.storage(), `custom-sounds/${owner}/${fileName}`);
  for (const [extension, contentType] of [['mp3', 'audio/mpeg'], ['wav', 'audio/wav'], ['wav', 'audio/x-wav'], ['m4a', 'audio/mp4'], ['m4a', 'audio/m4a'], ['m4a', 'audio/x-m4a']]) {
    await allowed(`owner uploads ${extension} as ${contentType}`, () => uploadBytes(storageRef(alice, `message_tone.${extension}`), bytes, { contentType }));
  }
  await allowed('owner reads own uploaded bytes', async () => assert.deepEqual(new Uint8Array(await getBytes(storageRef(alice))), bytes));
  await denied('another account cannot read private tone bytes', () => getBytes(storageRef(bob)));
  await denied('guest cannot read private tone bytes', () => getBytes(storageRef(guest)));
  await denied('admin claim alone cannot read private tone bytes', () => getBytes(storageRef(admin)));
  await denied('another account cannot replace private tone bytes', () => uploadBytes(storageRef(bob), bytes, { contentType: 'audio/wav' }));
  await denied('guest cannot upload a tone', () => uploadBytes(storageRef(guest), bytes, { contentType: 'audio/wav' }));
  await denied('profile alias is not a Storage UID path', () => uploadBytes(storageRef(alice, 'message_tone.wav', profile), bytes, { contentType: 'audio/wav' }));
  for (const fileName of ['arbitrary.wav', 'message_tone.mp4', 'call_ringtone.js', 'nested/message_tone.wav']) {
    await denied(`unsupported object path ${fileName}`, () => uploadBytes(storageRef(alice, fileName), bytes, { contentType: 'audio/wav' }));
  }
  await denied('wrong content type is rejected', () => uploadBytes(storageRef(alice), bytes, { contentType: 'text/javascript' }));
  await denied('mismatched extension and audio MIME are rejected', () => uploadBytes(storageRef(alice, 'message_tone.mp3'), bytes, { contentType: 'audio/wav' }));
  await denied('empty tone upload is rejected', () => uploadBytes(storageRef(alice), new Uint8Array(0), { contentType: 'audio/wav' }));
  await allowed('exact five MiB ringtone is supported', () => uploadBytes(storageRef(alice, 'call_ringtone.wav'), new Uint8Array(5 * 1024 * 1024), { contentType: 'audio/wav' }));
  await denied('more than five MiB is rejected', () => uploadBytes(storageRef(alice, 'call_ringtone.wav'), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: 'audio/wav' }));
  await denied('another account cannot delete private tone bytes', () => deleteObject(storageRef(bob)));
  await allowed('owner can delete its private tone', () => deleteObject(storageRef(alice)));
  console.log(`Custom sound rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
