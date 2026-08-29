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
  deleteField,
  doc,
  getFirestore,
  updateDoc,
} from 'firebase/firestore';

const projectId = process.env.GCLOUD_PROJECT || 'vybe-message-update-rules-test';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const adminApp = initializeAdminApp({ projectId }, `message-rules-admin-${Date.now()}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);

async function clientFor(uid, claims = {}) {
  const app = initializeApp(
    { projectId, apiKey: 'fake-api-key', authDomain: `${projectId}.firebaseapp.com` },
    `message-rules-${uid}-${Date.now()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const token = await adminAuth.createCustomToken(uid, claims);
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

const senderAuthId = 'auth-sender';
const recipientAuthId = 'auth-recipient';
const senderProfileId = 'profile-sender';
const recipientProfileId = 'profile-recipient';
const forgedProfileId = 'profile-victim';
const conversationId = `${senderProfileId}_${recipientProfileId}`;
const forgedConversationId = 'profile-victim_profile-other';
const messageId = 'message-under-test';
const now = new Date().toISOString();

await Promise.all([
  adminDb.doc(`user_auth_index/${senderAuthId}`).set({ profile_id: senderProfileId }),
  adminDb.doc(`user_auth_index/${recipientAuthId}`).set({ profile_id: recipientProfileId }),
  adminDb.doc(`profiles/${senderProfileId}`).set({ user_id: senderAuthId, username: 'sender' }),
  adminDb.doc(`profiles/${recipientProfileId}`).set({ user_id: recipientAuthId, username: 'recipient' }),
  adminDb.doc(`profiles/${forgedProfileId}`).set({ user_id: 'auth-victim', username: 'victim' }),
  adminDb.doc(`conversations/${conversationId}`).set({
    id: conversationId,
    member_ids: [senderProfileId, recipientProfileId],
  }),
  adminDb.doc(`conversations/${forgedConversationId}`).set({
    id: forgedConversationId,
    member_ids: [forgedProfileId, 'profile-other'],
  }),
]);

const message = {
  id: messageId,
  conversation_id: conversationId,
  sender_id: senderProfileId,
  content: 'original',
  view_mode: '24h',
  saved_by_sender: true,
  saved_by_recipient: true,
  saved_at: now,
  expires_at: null,
  viewed_at: null,
  is_deleted: false,
  created_at: now,
};

async function writeMessages(nextMessage) {
  await Promise.all([
    adminDb.doc(`messages/${messageId}`).set(nextMessage),
    adminDb.doc(`conversations/${conversationId}/messages/${messageId}`).set(nextMessage),
  ]);
}

async function resetMessages() {
  await writeMessages(message);
}

await resetMessages();

const senderDb = await clientFor(senderAuthId);
const recipientDb = await clientFor(recipientAuthId);
const outsiderDb = await clientFor('auth-outsider');
const adminDbClient = await clientFor('auth-admin', { admin: true });
const flatSenderRef = doc(senderDb, 'messages', messageId);
const flatRecipientRef = doc(recipientDb, 'messages', messageId);
const flatOutsiderRef = doc(outsiderDb, 'messages', messageId);
const flatAdminRef = doc(adminDbClient, 'messages', messageId);
const nestedSenderRef = doc(
  senderDb,
  'conversations',
  conversationId,
  'messages',
  messageId,
);
const nestedRecipientRef = doc(
  recipientDb,
  'conversations',
  conversationId,
  'messages',
  messageId,
);

await expectAllowed('sender can edit their own flat message', () =>
  updateDoc(flatSenderRef, { content: 'edited', is_edited: true, edited_at: now }),
);
await expectAllowed('recipient can record a flat message view', () =>
  updateDoc(flatRecipientRef, { viewed_at: now }),
);
await expectAllowed('sender can change only their flat-message save', () =>
  updateDoc(flatSenderRef, { saved_by_sender: false, saved_at: now }),
);
await resetMessages();
await expectAllowed('recipient can change only their flat-message save', () =>
  updateDoc(flatRecipientRef, { saved_by_recipient: false, saved_at: now }),
);
await resetMessages();
await expectDenied('sender cannot forge the flat message sender', () =>
  updateDoc(flatSenderRef, { sender_id: forgedProfileId }),
);
await resetMessages();
await expectDenied('sender cannot move a flat message into another conversation', () =>
  updateDoc(flatSenderRef, { conversation_id: forgedConversationId }),
);
await resetMessages();
await expectDenied('sender cannot clear the recipient flat-message save', () =>
  updateDoc(flatSenderRef, { saved_by_recipient: false, expires_at: now }),
);
await resetMessages();
await expectDenied('recipient cannot clear the sender flat-message save', () =>
  updateDoc(flatRecipientRef, { saved_by_sender: false, expires_at: now }),
);
await resetMessages();
await expectDenied('sender cannot write a non-boolean flat-message save flag', () =>
  updateDoc(flatSenderRef, { saved_by_sender: 'false' }),
);
await resetMessages();
await writeMessages({ ...message, saved_by_recipient: false });
await expectDenied('sender cannot delete an explicit recipient save field', () =>
  updateDoc(flatSenderRef, { saved_by_recipient: deleteField() }),
);
const withoutRecipientSave = { ...message };
delete withoutRecipientSave.saved_by_recipient;
await writeMessages(withoutRecipientSave);
await expectDenied('sender cannot add an absent recipient save field', () =>
  updateDoc(flatSenderRef, { saved_by_recipient: false }),
);
await resetMessages();
await expectDenied('non-member cannot update a flat message', () =>
  updateDoc(flatOutsiderRef, { viewed_at: now }),
);
await expectAllowed('admin retains flat-message repair access', () =>
  updateDoc(flatAdminRef, { sender_id: forgedProfileId }),
);

await resetMessages();
await expectAllowed('sender can edit their own nested message', () =>
  updateDoc(nestedSenderRef, { content: 'nested edit', is_edited: true, edited_at: now }),
);
await expectAllowed('recipient can record a nested message view', () =>
  updateDoc(nestedRecipientRef, { viewed_at: now }),
);
await expectAllowed('sender can change only their nested-message save', () =>
  updateDoc(nestedSenderRef, { saved_by_sender: false, saved_at: now }),
);
await resetMessages();
await expectAllowed('recipient can change only their nested-message save', () =>
  updateDoc(nestedRecipientRef, { saved_by_recipient: false, saved_at: now }),
);
await resetMessages();
await expectDenied('sender cannot forge the nested message sender', () =>
  updateDoc(nestedSenderRef, { sender_id: forgedProfileId }),
);
await resetMessages();
await expectDenied('sender cannot move a nested message into another conversation', () =>
  updateDoc(nestedSenderRef, { conversation_id: forgedConversationId }),
);
await resetMessages();
await expectDenied('sender cannot clear the recipient nested-message save', () =>
  updateDoc(nestedSenderRef, { saved_by_recipient: false, expires_at: now }),
);
await resetMessages();
await expectDenied('recipient cannot clear the sender nested-message save', () =>
  updateDoc(nestedRecipientRef, { saved_by_sender: false, expires_at: now }),
);
await resetMessages();
await expectDenied('recipient cannot write a non-boolean nested-message save flag', () =>
  updateDoc(nestedRecipientRef, { saved_by_recipient: 'false' }),
);
await writeMessages({ ...message, saved_by_sender: false });
await expectDenied('recipient cannot delete an explicit sender save field', () =>
  updateDoc(nestedRecipientRef, { saved_by_sender: deleteField() }),
);

const legacyMessageId = 'legacy-auth-uid-message';
const legacyMessage = {
  ...message,
  id: legacyMessageId,
  sender_id: senderAuthId,
  saved_by_sender: false,
};
await adminDb.doc(`messages/${legacyMessageId}`).set(legacyMessage);
await expectAllowed('legacy auth-uid sender can change their own save flag', () =>
  updateDoc(doc(senderDb, 'messages', legacyMessageId), { saved_by_sender: true }),
);

process.exit(process.exitCode || 0);
