#!/usr/bin/env node
/**
 * Two-client realtime messaging smoke test against the Firestore emulator.
 *
 * This never connects to production. It creates temporary auth identities in a
 * demo project, seeds a conversation through a rules-disabled test context,
 * and proves that both members receive a server-created message plus a read
 * receipt without refreshing. It also verifies that outsiders cannot read the
 * thread and clients cannot bypass the callable-only create path.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const rules = readFileSync(resolve(root, 'firestore.rules'), 'utf8');
const projectId = process.env.GCLOUD_PROJECT || 'demo-vybe-rules';
const host = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[0];
const port = Number((process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':')[1]);

if (!projectId.startsWith('demo-')) {
  throw new Error(`Refusing to run emulator QA with non-demo project id: ${projectId}`);
}
if (!Number.isFinite(port)) throw new Error('Invalid Firestore emulator port');

const senderAuthId = 'qa-auth-sender';
const receiverAuthId = 'qa-auth-receiver';
const outsiderAuthId = 'qa-auth-outsider';
const senderProfileId = 'qa-profile-sender';
const receiverProfileId = 'qa-profile-receiver';
const conversationId = `${senderProfileId}_${receiverProfileId}`;
const messageId = 'qa-message-realtime';

function waitForMessage(db, predicate, label, timeoutMs = 10_000) {
  const messages = query(
    collection(db, 'messages'),
    where('conversation_id', '==', conversationId),
  );

  return new Promise((resolvePromise, rejectPromise) => {
    let unsubscribe = () => {};
    const timer = setTimeout(() => {
      unsubscribe();
      rejectPromise(new Error(`${label} did not receive the realtime message within ${timeoutMs}ms`));
    }, timeoutMs);

    unsubscribe = onSnapshot(
      messages,
      (snapshot) => {
        const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
        const match = rows.find((row) => row.id === messageId && predicate(row));
        if (!match) return;
        clearTimeout(timer);
        unsubscribe();
        resolvePromise(match);
      },
      (error) => {
        clearTimeout(timer);
        unsubscribe();
        rejectPromise(new Error(`${label} realtime listener failed: ${error.code || error.message}`));
      },
    );
  });
}

const testEnv = await initializeTestEnvironment({
  projectId,
  firestore: { rules, host, port },
});

try {
  await testEnv.clearFirestore();
  const now = new Date().toISOString();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await Promise.all([
      setDoc(doc(adminDb, 'user_auth_index', senderAuthId), { profile_id: senderProfileId }),
      setDoc(doc(adminDb, 'user_auth_index', receiverAuthId), { profile_id: receiverProfileId }),
      setDoc(doc(adminDb, 'profiles', senderProfileId), {
        id: senderProfileId,
        user_id: senderAuthId,
        username: 'qa_sender',
      }),
      setDoc(doc(adminDb, 'profiles', receiverProfileId), {
        id: receiverProfileId,
        user_id: receiverAuthId,
        username: 'qa_receiver',
      }),
      setDoc(doc(adminDb, 'conversations', conversationId), {
        id: conversationId,
        is_group: false,
        member_ids: [senderProfileId, receiverProfileId],
        created_by: senderProfileId,
        created_at: now,
        updated_at: now,
      }),
      setDoc(doc(adminDb, 'conversation_members', `${conversationId}_${senderProfileId}`), {
        id: `${conversationId}_${senderProfileId}`,
        conversation_id: conversationId,
        user_id: senderProfileId,
        role: 'member',
        created_at: now,
        updated_at: now,
      }),
      setDoc(doc(adminDb, 'conversation_members', `${conversationId}_${receiverProfileId}`), {
        id: `${conversationId}_${receiverProfileId}`,
        conversation_id: conversationId,
        user_id: receiverProfileId,
        role: 'member',
        created_at: now,
        updated_at: now,
      }),
    ]);
  });

  const senderDb = testEnv.authenticatedContext(senderAuthId).firestore();
  const receiverDb = testEnv.authenticatedContext(receiverAuthId).firestore();
  const outsiderDb = testEnv.authenticatedContext(outsiderAuthId).firestore();

  const message = {
    id: messageId,
    conversation_id: conversationId,
    sender_id: senderProfileId,
    content: 'realtime emulator hello',
    message_type: 'text',
    view_mode: 'permanent',
    saved_by_sender: false,
    saved_by_recipient: false,
    saved_at: null,
    expires_at: null,
    viewed_at: null,
    is_deleted: false,
    created_at: now,
  };

  // The client path is intentionally denied; production sends through the
  // server-authoritative callable.
  await assertFails(setDoc(doc(senderDb, 'messages', 'qa-client-bypass'), {
    ...message,
    id: 'qa-client-bypass',
  }));

  const senderSeesMessage = waitForMessage(
    senderDb,
    (row) => row.content === message.content,
    'sender',
  );
  const receiverSeesMessage = waitForMessage(
    receiverDb,
    (row) => row.content === message.content,
    'receiver',
  );

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'messages', messageId), message);
  });

  await Promise.all([senderSeesMessage, receiverSeesMessage]);
  console.log('✓ sender and receiver received the message through realtime listeners');

  await assertFails(getDocs(query(
    collection(outsiderDb, 'messages'),
    where('conversation_id', '==', conversationId),
  )));
  console.log('✓ non-member realtime/read access is denied');

  const viewedAt = new Date(Date.now() + 1_000).toISOString();
  const senderSeesReadReceipt = waitForMessage(
    senderDb,
    (row) => row.viewed_at === viewedAt,
    'sender read-receipt listener',
  );

  await assertSucceeds(updateDoc(doc(receiverDb, 'messages', messageId), {
    viewed_at: viewedAt,
  }));
  await senderSeesReadReceipt;
  console.log('✓ receiver read receipt reached the sender without refresh');

  const finalRows = await assertSucceeds(getDocs(query(
    collection(senderDb, 'messages'),
    where('conversation_id', '==', conversationId),
  )));
  const matchingRows = finalRows.docs.filter((entry) => entry.id === messageId);
  if (matchingRows.length !== 1) {
    throw new Error(`Expected one canonical message row, found ${matchingRows.length}`);
  }
  console.log('✓ canonical message identity remains unique');
  console.log('[realtime-message-emulator] PASS');
} finally {
  await testEnv.cleanup();
}
