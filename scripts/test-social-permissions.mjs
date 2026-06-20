#!/usr/bin/env node
/**
 * E2E client-permission test for Message + Add Friend flows (production Firestore rules).
 *
 * GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json node scripts/test-social-permissions.mjs
 */
import { readFileSync } from 'node:fs';
import { initFirebaseAdmin } from './migrate-firebase/_adminInit.mjs';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import {
  getAuth as getClientAuth,
  signInWithCustomToken,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  connectFirestoreEmulator,
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

async function step(label, fn) {
  try {
    await fn();
    console.log(`✓ ${label}`);
    return true;
  } catch (err) {
    const code = err?.code || 'unknown';
    const msg = err?.message || String(err);
    console.error(`✗ ${label}: [${code}] ${msg}`);
    return false;
  }
}

initFirebaseAdmin();
const adminAuth = getAuth();
const adminDb = getAdminFirestore();
const env = loadEnv();

const firebaseApp = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});
const clientAuth = getClientAuth(firebaseApp);
const clientDb = getFirestore(firebaseApp);

const ACTOR_AUTH_UID = '703760a8-1245-4fc1-b242-32619ecc0ef3';
const ACTOR_PROFILE_ID = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';

async function pickTargetProfile() {
  const snap = await adminDb.collection('profiles').limit(20).get();
  for (const d of snap.docs) {
    if (d.id === ACTOR_PROFILE_ID) continue;
    const data = d.data();
    if (data.username && data.user_id) return { id: d.id, user_id: data.user_id, username: data.username };
  }
  throw new Error('No target profile found');
}

async function main() {
  const target = await pickTargetProfile();
  console.log(`Actor: bakrix (${ACTOR_PROFILE_ID})`);
  console.log(`Target: ${target.username} (${target.id})\n`);

  const token = await adminAuth.createCustomToken(ACTOR_AUTH_UID);
  await signInWithCustomToken(clientAuth, token);
  console.log('Signed in with custom token\n');

  const now = new Date().toISOString();
  const sorted = [ACTOR_PROFILE_ID, target.id].sort();
  const chatId = sorted.join('_');
  const memberIds = [...new Set([ACTOR_PROFILE_ID, target.id, ACTOR_AUTH_UID, target.user_id])];
  const frId = `${ACTOR_PROFILE_ID}_${target.id}`;

  let passed = 0;
  let failed = 0;
  const run = async (label, fn) => {
    if (await step(label, fn)) passed++;
    else failed++;
  };

  await run('sync user_auth_index', async () => {
    await setDoc(
      doc(clientDb, 'user_auth_index', ACTOR_AUTH_UID),
      { profile_id: ACTOR_PROFILE_ID, updated_at: now },
      { merge: true },
    );
  });

  await run('read friend_requests by id (outbound)', async () => {
    const snap = await getDoc(doc(clientDb, 'friend_requests', frId));
    void snap.exists();
  });

  await run('read conversation_members before create (RPC path)', async () => {
    const compositeId = `${chatId}_${ACTOR_PROFILE_ID}`;
    const snap = await getDoc(doc(clientDb, 'conversation_members', compositeId));
    void snap.exists();
  });

  await run('create friend_request', async () => {
    await setDoc(doc(clientDb, 'friend_requests', frId), {
      id: frId,
      sender_id: ACTOR_PROFILE_ID,
      receiver_id: target.id,
      status: 'pending',
      created_at: now,
      updated_at: now,
    });
  });

  await run('upsert user_statuses', async () => {
    await setDoc(
      doc(clientDb, 'user_statuses', ACTOR_PROFILE_ID),
      {
        user_id: ACTOR_PROFILE_ID,
        emoji: '🎮',
        text: 'Gaming',
        expires_at: null,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  });

  await run('read user_statuses query', async () => {
    const snap = await getDocs(
      query(collection(clientDb, 'user_statuses'), where('user_id', '==', ACTOR_PROFILE_ID), limit(1)),
    );
    void snap.size;
  });

  await run('messages query (chat load path)', async () => {
    const chatId = sorted.join('_');
    const snap = await getDocs(
      query(
        collection(clientDb, 'messages'),
        where('conversation_id', '==', chatId),
        limit(50),
      ),
    );
    void snap.size;
  });

  await run('read conversations deterministic id', async () => {
    const snap = await getDoc(doc(clientDb, 'conversations', chatId));
    void snap.exists();
  });

  await run('create/update conversation', async () => {
    await setDoc(
      doc(clientDb, 'conversations', chatId),
      {
        id: chatId,
        is_group: false,
        member_ids: memberIds,
        name: null,
        avatar_url: null,
        created_by: ACTOR_PROFILE_ID,
        created_at: now,
        updated_at: now,
      },
      { merge: true },
    );
  });

  for (const memberId of memberIds) {
    const compositeId = `${chatId}_${memberId}`;
    await run(`create conversation_members ${compositeId}`, async () => {
      const existing = await getDoc(doc(clientDb, 'conversation_members', compositeId));
      if (existing.exists()) return;
      await setDoc(doc(clientDb, 'conversation_members', compositeId), {
        id: compositeId,
        conversation_id: chatId,
        user_id: memberId,
        role: 'member',
        is_muted: false,
        is_pinned: false,
        last_read_at: null,
        created_at: now,
        updated_at: now,
      });
    });
  }

  // Legacy orphan path: conv with empty member_ids but created_by actor
  const orphanSnap = await adminDb
    .collection('conversations')
    .where('created_by', '==', ACTOR_PROFILE_ID)
    .limit(1)
    .get();
  if (!orphanSnap.empty) {
    const orphan = orphanSnap.docs[0];
    const orphanId = orphan.id;
    const orphanData = orphan.data();
    if (!orphanData.member_ids?.length) {
      console.log(`\nTesting orphan conv repair: ${orphanId}`);
      await run('read orphan conversation', async () => {
        await getDoc(doc(clientDb, 'conversations', orphanId));
      });
      await run('update orphan member_ids', async () => {
        await setDoc(
          doc(clientDb, 'conversations', orphanId),
          { member_ids: memberIds, updated_at: now },
          { merge: true },
        );
      });
      await run('seed peer membership on orphan', async () => {
        const peerId = `${orphanId}_${target.id}`;
        await setDoc(doc(clientDb, 'conversation_members', peerId), {
          id: peerId,
          conversation_id: orphanId,
          user_id: target.id,
          role: 'member',
          created_at: now,
          updated_at: now,
        });
      });
    }
  }

  console.log(`\n── Result: ${passed} passed, ${failed} failed ──`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
