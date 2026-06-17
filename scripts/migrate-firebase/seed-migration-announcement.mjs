#!/usr/bin/env node
/**
 * Seed a founder announcement about the Firebase migration + optional in-app notifications.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   FIREBASE_PROJECT_ID=vybe-daaab \
 *   npm run migrate:firebase:seed-migration-notice
 *
 * Set SKIP_MIGRATION_NOTIFICATIONS=1 to upsert only the announcement doc.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const ANNOUNCEMENT_ID = 'firebase-migration-2026-06';
const FOUNDER_PROFILE_ID = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';
const BATCH_SIZE = 400;

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
if (!existsSync(SA_PATH)) {
  console.error(`❌ Service account not found at ${SA_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;

initializeApp({
  credential: cert(serviceAccount),
  projectId,
});

const db = getFirestore();
const createdAt = new Date().toISOString();

const announcement = {
  id: ANNOUNCEMENT_ID,
  title: 'VYBE was upgraded',
  content:
    'We moved to a new platform. Your posts, DMs, and profile are safe. Email users: tap Forgot password once to set a new password. Google or Apple sign-in works as before.',
  author_id: FOUNDER_PROFILE_ID,
  is_active: true,
  created_at: createdAt,
  image_url: null,
  media_type: null,
};

console.log(`Upserting announcement/${ANNOUNCEMENT_ID} → ${projectId}`);
await db.collection('announcements').doc(ANNOUNCEMENT_ID).set(announcement, { merge: true });
console.log('✅ Announcement upserted');

if (process.env.SKIP_MIGRATION_NOTIFICATIONS === '1') {
  console.log('⤼ Skipping notifications (SKIP_MIGRATION_NOTIFICATIONS=1)');
  process.exit(0);
}

const profilesSnap = await db.collection('profiles').select().get();
const profileIds = profilesSnap.docs
  .map((doc) => doc.id)
  .filter((id) => id !== FOUNDER_PROFILE_ID);

console.log(`Creating announcement notifications for ${profileIds.length} profiles…`);

let notified = 0;
for (let i = 0; i < profileIds.length; i += BATCH_SIZE) {
  const chunk = profileIds.slice(i, i + BATCH_SIZE);
  const batch = db.batch();
  for (const userId of chunk) {
    const ref = db.collection('notifications').doc();
    batch.set(ref, {
      user_id: userId,
      actor_id: FOUNDER_PROFILE_ID,
      type: 'announcement',
      read: false,
      created_at: createdAt,
      title: announcement.title,
      body: announcement.content,
    });
  }
  await batch.commit();
  notified += chunk.length;
  console.log(`  batch ${Math.floor(i / BATCH_SIZE) + 1}: +${chunk.length} (total ${notified})`);
}

console.log(`\nDone. announcement=${ANNOUNCEMENT_ID} notifications=${notified}`);
