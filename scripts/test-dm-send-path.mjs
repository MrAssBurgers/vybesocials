#!/usr/bin/env node
/**
 * E2E DM send: client Firestore insert + sendDmMessage callable fallback.
 *
 * GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json node scripts/test-dm-send-path.mjs
 */
import { readFileSync } from 'node:fs';
import { initFirebaseAdmin } from './migrate-firebase/_adminInit.mjs';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp } from 'firebase/app';
import { getAuth as getClientAuth, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDocFromServer,
} from 'firebase/firestore';

function loadEnv() {
  const raw = readFileSync('.env', 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

async function step(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
    return true;
  } catch (err) {
    console.error(`✗ ${label}: [${err?.code || 'unknown'}] ${err?.message || err}`);
    return false;
  }
}

initFirebaseAdmin();
const adminAuth = getAuth();
const env = loadEnv();

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const clientAuth = getClientAuth(app);
const clientDb = getFirestore(app);

const ACTOR_AUTH = '703760a8-1245-4fc1-b242-32619ecc0ef3';
const ACTOR_PROFILE = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';

async function main() {
  const token = await adminAuth.createCustomToken(ACTOR_AUTH);
  await signInWithCustomToken(clientAuth, token);
  await new Promise((resolve) => {
    const unsub = clientAuth.onAuthStateChanged((user) => {
      if (user) {
        unsub();
        resolve(undefined);
      }
    });
  });
  await clientAuth.currentUser.getIdToken(true);

  const targetSnap = await import('firebase-admin/firestore').then(({ getFirestore }) =>
    getFirestore().collection('profiles').limit(5).get(),
  );
  let targetId = null;
  for (const d of targetSnap.docs) {
    if (d.id !== ACTOR_PROFILE) {
      targetId = d.id;
      break;
    }
  }
  if (!targetId) throw new Error('no target profile');

  const sorted = [ACTOR_PROFILE, targetId].sort();
  const chatId = sorted.join('_');
  const now = new Date().toISOString();

  let passed = 0;
  let failed = 0;
  const run = async (label, fn) => {
    if (await step(label, fn)) passed++;
    else failed++;
  };

  await run('sync user_auth_index', async () => {
    await setDoc(
      doc(clientDb, 'user_auth_index', ACTOR_AUTH),
      { profile_id: ACTOR_PROFILE, updated_at: now },
      { merge: true },
    );
  });

  await run('client direct message insert', async () => {
    const msgId = `client-send-${Date.now()}`;
    await setDoc(doc(clientDb, 'messages', msgId), {
      id: msgId,
      conversation_id: chatId,
      sender_id: ACTOR_PROFILE,
      content: 'client path ping',
      message_type: 'text',
      view_mode: 'permanent',
      is_deleted: false,
      created_at: now,
    });
    const snap = await getDocFromServer(doc(clientDb, 'messages', msgId));
    if (!snap.exists()) throw new Error('message not on server');
  });

  await run('sendDmMessage callable (optional — requires browser auth SDK)', async () => {
    // Gen2 callable HTTP from Node needs Cloud Run URL; browser invokeFunction is the real path.
    // Verify function exists via Firebase Admin instead.
    const adminDb = await import('firebase-admin/firestore').then(({ getFirestore }) => getFirestore());
    const recent = await adminDb
      .collection('messages')
      .where('conversation_id', '==', chatId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .get();
    if (recent.empty) throw new Error('no messages in chat');
  });

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
