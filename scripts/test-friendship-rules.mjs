#!/usr/bin/env node
import { initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getFirestore,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'vybe-friendship-rules-test';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const adminApp = initializeAdminApp({ projectId }, `friendship-rules-admin-${Date.now()}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

async function clientFor(uid, admin = false) {
  const app = initializeApp(
    { projectId, apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com` },
    `friendship-rules-${uid}-${Date.now()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth.createCustomToken(uid, admin ? { admin: true } : {});
  await signInWithCustomToken(auth, token);
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
  return firestore;
}

async function expectAllowed(label, operation) {
  try {
    await operation();
    console.log(`✓ ${label}`);
  } catch (error) {
    console.error(`✗ ${label}: expected allow, got ${error.code || error.message}`);
    process.exitCode = 1;
  }
}

async function expectDenied(label, operation) {
  try {
    await operation();
    console.error(`✗ ${label}: unexpectedly allowed`);
    process.exitCode = 1;
  } catch (error) {
    if (String(error.code || '').includes('permission-denied')) {
      console.log(`✓ ${label}`);
      return;
    }
    console.error(`✗ ${label}: unexpected ${error.code || error.message}`);
    process.exitCode = 1;
  }
}

const sender = 'rules-sender';
const receiver = 'rules-receiver';
const requestId = `${sender}_${receiver}`;
const now = new Date().toISOString();
const validRequest = {
  id: requestId,
  sender_id: sender,
  receiver_id: receiver,
  status: 'pending',
  created_at: now,
  updated_at: now,
};

await adminDb.recursiveDelete(adminDb.collection('friend_requests'));
const regularDb = await clientFor(sender);
const adminClientDb = await clientFor('rules-admin', true);
const regularRef = doc(regularDb, 'friend_requests', requestId);
const adminRef = doc(adminClientDb, 'friend_requests', requestId);

await expectDenied('normal clients cannot create friend requests directly', () =>
  setDoc(regularRef, validRequest),
);
await expectDenied('schema rejects self requests', () =>
  setDoc(doc(adminClientDb, 'friend_requests', `${sender}_${sender}`), {
    ...validRequest,
    id: `${sender}_${sender}`,
    receiver_id: sender,
  }),
);
await expectDenied('schema rejects extra fields', () =>
  setDoc(doc(adminClientDb, 'friend_requests', `${sender}_other`), {
    ...validRequest,
    id: `${sender}_other`,
    receiver_id: 'other',
    injected: true,
  }),
);
await expectAllowed('admin diagnostic create validates canonical schema', () =>
  setDoc(adminRef, validRequest),
);
await expectAllowed('pending can transition to declined', () =>
  updateDoc(adminRef, { status: 'declined', updated_at: new Date().toISOString() }),
);
await expectDenied('declined cannot transition directly to accepted', () =>
  updateDoc(adminRef, { status: 'accepted', updated_at: new Date().toISOString() }),
);
await expectAllowed('declined can return to pending', () =>
  updateDoc(adminRef, { status: 'pending', updated_at: new Date().toISOString() }),
);
await expectAllowed('pending can transition to cancelled', () =>
  updateDoc(adminRef, { status: 'cancelled', updated_at: new Date().toISOString() }),
);
await expectDenied('client deletes remain denied', () => deleteDoc(adminRef));

process.exit(process.exitCode || 0);
