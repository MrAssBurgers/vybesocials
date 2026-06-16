#!/usr/bin/env node
/**
 * One-time: create or update the preview founder in Firebase Auth + Firestore.
 * Run from repo root:
 *   cd functions && FIREBASE_FOUNDER_PASSWORD='...' node scripts/ensure-firebase-founder.mjs
 */
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'vybe-daaab';
const EMAIL = (process.env.FIREBASE_FOUNDER_EMAIL || 'barron.bakic@gmail.com').trim().toLowerCase();
const PASSWORD = process.env.FIREBASE_FOUNDER_PASSWORD || '';
const USERNAME = process.env.FIREBASE_FOUNDER_USERNAME || 'Bakrix';

if (!PASSWORD || PASSWORD.length < 6) {
  console.error('Set FIREBASE_FOUNDER_PASSWORD (min 6 chars) — do not commit it.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: PROJECT_ID,
  });
}

const auth = getAuth();
const db = getFirestore();

let uid;

try {
  const created = await auth.createUser({
    email: EMAIL,
    password: PASSWORD,
    displayName: USERNAME,
    emailVerified: true,
  });
  uid = created.uid;
  console.log(`Created Firebase Auth user ${EMAIL} (${uid})`);
} catch (err) {
  if (err?.code !== 'auth/email-already-exists') throw err;
  const existing = await auth.getUserByEmail(EMAIL);
  uid = existing.uid;
  await auth.updateUser(uid, {
    password: PASSWORD,
    displayName: USERNAME,
    emailVerified: true,
  });
  console.log(`Updated password for existing user ${EMAIL} (${uid})`);
}

const now = new Date().toISOString();
await db.collection('profiles').doc(uid).set(
  {
    id: uid,
    user_id: uid,
    username: USERNAME,
    display_name: USERNAME,
    bio: '',
    onboarding_completed: true,
    is_verified: true,
    updated_at: now,
    created_at: FieldValue.serverTimestamp(),
  },
  { merge: true },
);

for (const coll of ['user_roles', 'user_roles_auth']) {
  await db.collection(coll).doc(`${uid}_owner`).set(
    {
      id: `${uid}_owner`,
      user_id: uid,
      role: 'owner',
      created_at: now,
      updated_at: now,
    },
    { merge: true },
  );
}

console.log(`Firestore profile + owner roles ready for @${USERNAME} (${uid})`);
