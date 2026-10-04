import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

// Fail closed: these tests must never connect to a live Firebase project.
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-creators';
assert.ok(projectId.startsWith('demo-'), 'Use a demo- project for emulator-only tests');
assert.ok(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'Run with Firebase emulators:exec --only firestore,storage');
const require = createRequire(path.resolve(process.env.FIREBASE_TEST_TOOLS_ROOT || '.', 'package.json'));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
// Resolve the same SDK instance as the isolated rules test tools.
const { doc, collection, setDoc, getDoc, getDocs, query, where, documentId, limit, updateDoc, deleteDoc, serverTimestamp, Timestamp } = require('firebase/firestore');
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
const alice = env.authenticatedContext('creator-alice');
const bob = env.authenticatedContext('creator-bob');
const guest = env.unauthenticatedContext();
const staff = env.authenticatedContext('creator-staff', { admin: true });
const app = () => ({ schema_version: 1, owner_id: 'creator-alice', title: 'Tiny game', description: 'Test fixture', category: 'game', html: '<button>Play</button>', css: '', javascript: '', created_at: serverTimestamp(), updated_at: serverTimestamp() });
const aliceDb = alice.firestore();
const bobDb = bob.firestore();
const privateRef = doc(aliceDb, 'mini_app_drafts', 'test-app');
const publicRef = doc(aliceDb, 'mini_apps', 'test-app');

try {
  await env.clearFirestore();
  await env.clearStorage();
  await allowed('owner creates a private draft', () => setDoc(privateRef, app()));
  await allowed('owner reads own draft', () => getDoc(privateRef));
  await denied('another account cannot read draft code', () => getDoc(doc(bobDb, privateRef.path)));
  await denied('signed-out clients cannot read drafts', () => getDoc(doc(guest.firestore(), privateRef.path)));
  await denied('creator cannot forge an owner', () => setDoc(doc(bobDb, 'mini_app_drafts', 'forged'), app()));
  await denied('creator cannot transfer ownership', () => updateDoc(privateRef, { owner_id: 'creator-bob', updated_at: serverTimestamp() }));
  await denied('draft cannot carry arbitrary privilege fields', () => updateDoc(privateRef, { admin: true, updated_at: serverTimestamp() }));
  await denied('malformed category rejected', () => updateDoc(privateRef, { category: 'system', updated_at: serverTimestamp() }));
  await denied('oversized source rejected', () => updateDoc(privateRef, { html: 'x'.repeat(100001), updated_at: serverTimestamp() }));
  await denied('empty title rejected', () => updateDoc(privateRef, { title: '', updated_at: serverTimestamp() }));
  await denied('client cannot forge update timestamp', () => updateDoc(privateRef, { title: 'Fake time', updated_at: Timestamp.fromMillis(0) }));
  await denied('creation timestamp stays immutable', () => updateDoc(privateRef, { created_at: Timestamp.fromMillis(0), updated_at: serverTimestamp() }));
  await allowed('first publish can detect a missing snapshot', () => getDoc(publicRef));
  await allowed('owner publishes a separate snapshot', () => setDoc(publicRef, { ...app(), status: 'published' }));
  await allowed('another signed-in account can read published app', () => getDoc(doc(bobDb, publicRef.path)));
  await denied('signed-out clients cannot read published code', () => getDoc(doc(guest.firestore(), publicRef.path)));
  await allowed('public gallery query is permitted', () => getDocs(query(collection(bobDb, 'mini_apps'), where('status', '==', 'published'))));
  await allowed('private library query is limited to its owner', () => getDocs(query(collection(aliceDb, 'mini_app_drafts'), where('owner_id', '==', 'creator-alice'))));
  // The studio retains an identity before saving. On a lost acknowledgement,
  // it must distinguish a new draft from a committed one without opening reads
  // of missing/private documents to other users.
  const recoveryQuery = (db, ownerId, id) => query(collection(db, 'mini_app_drafts'), where('owner_id', '==', ownerId), where(documentId(), '>=', id), limit(1));
  await allowed('draft recovery safely returns empty for a new owned identity', async () => {
    const matches = await getDocs(recoveryQuery(aliceDb, 'creator-alice', 'zz-pending-new'));
    assert.equal(matches.size, 0);
  });
  await allowed('draft recovery never mistakes a neighboring owned draft for the pending identity', async () => {
    const matches = await getDocs(recoveryQuery(aliceDb, 'creator-alice', 'pending-new'));
    assert.equal(matches.size, 1);
    assert.equal(matches.docs[0].id, privateRef.id);
    assert.equal(matches.docs.find(row => row.id === 'pending-new'), undefined);
  });
  await allowed('draft recovery finds the committed owned source after a lost acknowledgement', async () => {
    const matches = await getDocs(recoveryQuery(aliceDb, 'creator-alice', privateRef.id));
    assert.equal(matches.size, 1);
    assert.equal(matches.docs[0].id, privateRef.id);
    assert.equal(matches.docs[0].data().html, '<button>Play</button>');
  });
  await allowed('own recovery query cannot reveal another account source at a known identity', async () => {
    const matches = await getDocs(recoveryQuery(bobDb, 'creator-bob', privateRef.id));
    assert.equal(matches.size, 0);
  });
  await denied('another account cannot recover with the creator owner filter', () => getDocs(recoveryQuery(bobDb, 'creator-alice', privateRef.id)));
  await denied('signed-out clients cannot recover a private draft', () => getDocs(recoveryQuery(guest.firestore(), 'creator-alice', privateRef.id)));
  await denied('document identity alone does not authorize private draft recovery', () => getDocs(query(collection(bobDb, 'mini_app_drafts'), where(documentId(), '==', privateRef.id), limit(1))));
  await denied('direct missing private draft reads remain denied', () => getDoc(doc(aliceDb, 'mini_app_drafts', 'pending-new')));
  await denied('unfiltered private draft scan rejected', () => getDocs(collection(bobDb, 'mini_app_drafts')));
  await denied('others cannot overwrite published code', () => updateDoc(doc(bobDb, publicRef.path), { html: 'hijack', updated_at: serverTimestamp() }));
  await denied('publication cannot spoof status', () => updateDoc(publicRef, { status: 'featured', updated_at: serverTimestamp() }));
  await allowed('saving draft leaves public snapshot alone', () => updateDoc(privateRef, { html: '<p>Unreleased</p>', updated_at: serverTimestamp() }));
  assert.equal((await getDoc(publicRef)).data().html, '<button>Play</button>'); checks++;
  await denied('another user cannot unpublish', () => deleteDoc(doc(bobDb, publicRef.path)));
  await allowed('staff can remove a published app', () => deleteDoc(doc(staff.firestore(), publicRef.path)));
  await denied('another user cannot take over an unpublished app link', () => setDoc(doc(bobDb, publicRef.path), { ...app(), owner_id: 'creator-bob', status: 'published' }));
  await denied('publishing without an owned draft is rejected', () => setDoc(doc(aliceDb, 'mini_apps', 'no-draft'), { ...app(), status: 'published' }));
  await allowed('owner can republish with a fresh creation time', () => setDoc(publicRef, { ...app(), status: 'published' }));
  await allowed('owner can unpublish', () => deleteDoc(publicRef));
  assert.equal((await getDoc(privateRef)).exists(), true); checks++;

  const captureId = 'a'.repeat(48);
  const capturePath = `game-captures/creator-alice/${captureId}`;
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const capture = { owner_uid: 'creator-alice', status: 'uploading', expires_at_ms: Date.now() + 60000, byte_size: bytes.length, content_type: 'image/png' };
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'game_captures', captureId), capture);
    await setDoc(doc(context.firestore(), 'saved_themes', 'own-theme'), { user_id: 'creator-alice', name: 'My theme' });
  });
  await denied('clients cannot mint upload sessions', () => setDoc(doc(aliceDb, 'game_captures', 'forged'), capture));
  await denied('clients cannot read upload metadata directly', () => getDoc(doc(aliceDb, 'game_captures', captureId)));
  await denied('unregistered uploads rejected', () => uploadBytes(ref(alice.storage(), 'game-captures/creator-alice/no-session'), bytes, { contentType: 'image/png' }));
  await denied('wrong account cannot upload', () => uploadBytes(ref(bob.storage(), capturePath), bytes, { contentType: 'image/png' }));
  await denied('wrong MIME rejected', () => uploadBytes(ref(alice.storage(), capturePath), bytes, { contentType: 'image/jpeg' }));
  await denied('wrong size rejected', () => uploadBytes(ref(alice.storage(), capturePath), new Uint8Array(16), { contentType: 'image/png' }));
  await allowed('owner uploads an exact registered capture', () => uploadBytes(ref(alice.storage(), capturePath), bytes, { contentType: 'image/png' }));
  await allowed('owner can read private media', () => getBytes(ref(alice.storage(), capturePath)));
  await denied('other users cannot read private capture', () => getBytes(ref(bob.storage(), capturePath)));
  await denied('anonymous users cannot read private capture', () => getBytes(ref(guest.storage(), capturePath)));
  await denied('validated media cannot be overwritten', () => uploadBytes(ref(alice.storage(), capturePath), bytes, { contentType: 'image/png' }));
  await denied('clients cannot delete pending media behind server state', () => deleteObject(ref(alice.storage(), capturePath)));
  await env.withSecurityRulesDisabled(context => updateDoc(doc(context.firestore(), 'game_captures', captureId), { expires_at_ms: 0 }));
  await denied('expired capture cannot be read', () => getBytes(ref(alice.storage(), capturePath)));
  await allowed('saved theme owner can read existing resource', () => getDoc(doc(aliceDb, 'saved_themes', 'own-theme')));
  await denied('saved theme stays private from another account', () => getDoc(doc(bobDb, 'saved_themes', 'own-theme')));

  const partnerCaptureId = 'b'.repeat(48);
  const partnerCapturePath = `game-captures/creator-alice/${partnerCaptureId}`;
  await env.withSecurityRulesDisabled(context => setDoc(doc(context.firestore(), 'game_captures', partnerCaptureId), { ...capture, partner_connection_id: 'test-connection' }));
  await denied('owner cannot preempt server-composed partner capture', () => uploadBytes(ref(alice.storage(), partnerCapturePath), bytes, { contentType: 'image/png' }));
  await env.withSecurityRulesDisabled(async context => {
    await uploadBytes(ref(context.storage(), partnerCapturePath), bytes, { contentType: 'image/png' });
    await updateDoc(doc(context.firestore(), 'game_captures', partnerCaptureId), { status: 'ready' });
  });
  await allowed('owner can review a completed partner capture', () => getBytes(ref(alice.storage(), partnerCapturePath)));
  await denied('other users cannot read a completed partner capture', () => getBytes(ref(bob.storage(), partnerCapturePath)));

  const serverCollections = ['game_partner_devices', 'game_partner_codes', 'game_partner_tokens', 'game_partner_connections', 'game_partner_uploads'];
  await env.withSecurityRulesDisabled(async context => {
    for (const table of serverCollections) await setDoc(doc(context.firestore(), table, 'private-test'), { owner_uid: 'creator-alice', test: true });
    await uploadBytes(ref(context.storage(), 'game-partner-staging/private-test/0'), bytes);
  });
  for (const [label, client] of [['owner', alice], ['other account', bob], ['guest', guest], ['app admin', staff]]) {
    for (const table of serverCollections) {
      const metadata = doc(client.firestore(), table, 'private-test');
      await denied(`${label} cannot read ${table}`, () => getDoc(metadata));
      await denied(`${label} cannot list ${table}`, () => getDocs(collection(client.firestore(), table)));
      await denied(`${label} cannot mint ${table}`, () => setDoc(doc(client.firestore(), table, 'forged'), { owner_uid: 'creator-alice' }));
      await denied(`${label} cannot modify ${table}`, () => updateDoc(metadata, { revoked_at_ms: null }));
      await denied(`${label} cannot delete ${table}`, () => deleteDoc(metadata));
    }
    const chunk = ref(client.storage(), 'game-partner-staging/private-test/0');
    await denied(`${label} cannot read partner staging`, () => getBytes(chunk));
    await denied(`${label} cannot overwrite partner staging`, () => uploadBytes(chunk, bytes));
    await denied(`${label} cannot create partner staging`, () => uploadBytes(ref(client.storage(), 'game-partner-staging/private-test/1'), bytes));
    await denied(`${label} cannot delete partner staging`, () => deleteObject(chunk));
  }
  console.log(`Creator platform rules: ${checks} checks passed`);
} finally { await env.cleanup(); }
