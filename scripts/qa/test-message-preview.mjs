import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

assert.equal(process.env.GCLOUD_PROJECT, 'demo-vybe-preview');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9199');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8280');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, '127.0.0.1:9399');
assert.equal(process.env.FUNCTIONS_EMULATOR_HOST, '127.0.0.1:5101');
const { initializeApp, deleteApp } = await import('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import('firebase/auth');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = await import('firebase/functions');
const { getFirestore, connectFirestoreEmulator, getDocFromServer, doc } = await import('firebase/firestore');
const apps = [];
async function actor(name) {
  const app = initializeApp({ apiKey: 'demo-local-only', projectId: 'demo-vybe-preview', appId: `demo-message-${name}` }, `message-fixture-${name}-${randomUUID()}`);
  apps.push(app);
  const auth = getAuth(app); connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  const functions = getFunctions(app, 'us-central1'); connectFunctionsEmulator(functions, '127.0.0.1', 5101);
  const db = getFirestore(app); connectFirestoreEmulator(db, '127.0.0.1', 8280);
  await signInWithEmailAndPassword(auth, `${name}@vybe.test`, 'Vybe-local-preview-only-2026!');
  assert.equal(auth.currentUser.uid, `preview-${name}`);
  return { functions, db };
}
try {
  const bob = await actor('bob'), alice = await actor('alice');
  const conversationId = 'preview-profile-alice_preview-profile-bob';
  const content = 'Synthetic message for the local safety walkthrough. No real person or conversation is involved.';
  const input = { conversationId, content, messageType: 'text', viewMode: 'permanent', otherProfileId: 'preview-profile-alice', clientMessageId: 'preview-safety-message-v1', expectedSenderUid: 'preview-bob' };
  const send = httpsCallable(bob.functions, 'sendDmMessage');
  await assert.rejects(send({ ...input, expectedSenderUid: 'preview-alice' }), error => error.code === 'functions/failed-precondition');
  const sent = (await send(input)).data;
  assert.equal(sent.message.content, content); assert.equal(sent.message.sender_id, 'preview-profile-bob');
  const again = (await send(input)).data;
  assert.equal(again.message.id, sent.message.id); assert.equal(again.deduped, true);
  const received = await getDocFromServer(doc(alice.db, 'messages', sent.message.id));
  assert.equal(received.data().content, content);
  const self = httpsCallable(bob.functions, 'reportModeration');
  await assert.rejects(self({ action: 'submit', requestId: 'preview-own-message-rejected-v1', targetType: 'message', targetId: sent.message.id, reason: 'other' }), error => error.code === 'functions/invalid-argument');
  const output = new URL('../../work/local-preview/message-fixture/', import.meta.url);
  await mkdir(output, { recursive: true });
  const fixture = { conversationId, messageId: sent.message.id, url: `http://127.0.0.1:8082/messages/${conversationId}` };
  await writeFile(new URL('latest-message.json', output), JSON.stringify(fixture, null, 2));
  console.log('Message preview: 5 checks passed (account mismatch denial, real authenticated send, retry, recipient read and own-message report denial).');
  console.log(JSON.stringify(fixture));
} finally { await Promise.all(apps.map(deleteApp)); }
