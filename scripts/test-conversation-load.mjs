#!/usr/bin/env node
/** Simulates ChatView load on legacy UUID conversation after composite seed. */
import { readFileSync } from 'fs';
import { initFirebaseAdmin } from './migrate-firebase/_adminInit.mjs';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { getAuth as getClientAuth, signInWithCustomToken } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
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

initFirebaseAdmin();
const env = loadEnv();
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const clientAuth = getClientAuth(app);
const clientDb = getFirestore(app);
const adminDb = getAdminDb();

const ACTOR_AUTH = '703760a8-1245-4fc1-b242-32619ecc0ef3';
const ACTOR_PROFILE = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';
const LEGACY_CID = '19123c8a-4f43-492b-ae5c-dc24e66858dc';

async function main() {
  const token = await getAuth().createCustomToken(ACTOR_AUTH);
  await signInWithCustomToken(clientAuth, token);

  const compositeId = `${LEGACY_CID}_${ACTOR_PROFILE}`;
  await setDoc(
    doc(clientDb, 'conversation_members', compositeId),
    {
      id: compositeId,
      conversation_id: LEGACY_CID,
      user_id: ACTOR_PROFILE,
      role: 'member',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { merge: true },
  );

  await getDoc(doc(clientDb, 'conversations', LEGACY_CID));
  const members = await getDocs(
    query(collection(clientDb, 'conversation_members'), where('conversation_id', '==', LEGACY_CID)),
  );
  const messages = await getDocs(
    query(
      collection(clientDb, 'messages'),
      where('conversation_id', '==', LEGACY_CID),
      where('is_deleted', '==', false),
      limit(50),
    ),
  );

  console.log('legacy chat load OK — members:', members.size, 'messages:', messages.size);
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL', e.code || e.message);
  process.exit(1);
});
