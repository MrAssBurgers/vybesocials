#!/usr/bin/env node
/**
 * Remove expired temporary user_bans from Firestore (vybe-daaab).
 *
 * Permanent bans (is_permanent) are kept. Temporary bans with expires_at <= now are deleted.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json node scripts/repair-expired-bans.mjs
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json node scripts/repair-expired-bans.mjs --dry
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json node scripts/repair-expired-bans.mjs --user=e78010f2-d5f1-428b-b5df-8fc6b768772d
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const USER_ID = args.find((a) => a.startsWith('--user='))?.split('=')[1];

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin.json';
if (!existsSync(SA_PATH)) {
  console.error(`Service account not found at ${SA_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(await readFile(SA_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function isBanActive(data) {
  if (data.is_permanent) return true;
  if (!data.expires_at) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

async function main() {
  const snap = USER_ID
    ? await db.collection('user_bans').where('user_id', '==', USER_ID).get()
    : await db.collection('user_bans').get();

  let expired = 0;
  let active = 0;
  const details = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const activeBan = isBanActive(data);
    if (activeBan) {
      active += 1;
      details.push({ id: doc.id, user_id: data.user_id, status: 'active', ...data });
      continue;
    }

    expired += 1;
    details.push({ id: doc.id, user_id: data.user_id, status: 'expired', ...data });
    if (!DRY) {
      await doc.ref.delete();
    }
  }

  console.log(JSON.stringify({
    dry: DRY,
    userFilter: USER_ID ?? null,
    total: snap.size,
    active,
    expired,
    deleted: DRY ? 0 : expired,
    bans: details,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
