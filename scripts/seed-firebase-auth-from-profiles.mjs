#!/usr/bin/env node
/**
 * Pre-create Firebase Auth users from Lovable profiles export (UID + email, no password).
 * Users reset password or use Google/Apple on first login.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   npm run migrate:firebase:seed-auth
 *
 * Optional:
 *   PROFILES_JSON=./export/lovable-cloud-export/tables/profiles.json
 *   --dry
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DRY = process.argv.includes('--dry');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
const PROFILES_PATH =
  process.env.PROFILES_JSON || join(ROOT, 'export/lovable-cloud-export/tables/profiles.json');

if (!existsSync(SA_PATH)) {
  console.error(`❌ Service account not found at ${SA_PATH}`);
  process.exit(1);
}
if (!existsSync(PROFILES_PATH)) {
  console.error(`❌ Profiles export not found at ${PROFILES_PATH}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(SA_PATH, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();

const profiles = JSON.parse(readFileSync(PROFILES_PATH, 'utf8'));
if (!Array.isArray(profiles)) {
  console.error('❌ profiles.json must be an array');
  process.exit(1);
}

/** Dedupe by auth UID (profiles.user_id) or profile id. */
const byUid = new Map();

for (const p of profiles) {
  const uid = String(p.user_id || p.id || '').trim();
  if (!uid) continue;

  const email = typeof p.email === 'string' && p.email.includes('@') ? p.email.trim() : undefined;
  const displayName = p.display_name || p.username || undefined;
  const photoUrl = p.avatar_url || undefined;

  const existing = byUid.get(uid);
  if (existing) {
    if (!existing.email && email) existing.email = email;
    if (!existing.displayName && displayName) existing.displayName = displayName;
    if (!existing.photoUrl && photoUrl) existing.photoUrl = photoUrl;
    continue;
  }

  byUid.set(uid, {
    uid,
    email,
    displayName,
    photoUrl,
    emailVerified: Boolean(email),
  });
}

console.log(`Seed Firebase Auth from ${profiles.length} profiles → ${byUid.size} unique UIDs${DRY ? ' (DRY)' : ''}\n`);

let created = 0;
let updated = 0;
let skipped = 0;
let failed = 0;

for (const user of byUid.values()) {
  if (!user.email) {
    skipped++;
    continue;
  }

  if (DRY) {
    console.log(`  would upsert ${user.uid} ${user.email}`);
    created++;
    continue;
  }

  try {
    try {
      await auth.getUser(user.uid);
      await auth.updateUser(user.uid, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoUrl,
        emailVerified: user.emailVerified,
      });
      updated++;
    } catch (err) {
      if (err?.code !== 'auth/user-not-found') throw err;
      await auth.createUser({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoUrl,
        emailVerified: user.emailVerified,
      });
      created++;
    }
  } catch (err) {
    failed++;
    const msg = err?.message || String(err);
    if (failed <= 10) console.warn(`  ⚠️  ${user.uid} (${user.email}): ${msg}`);
  }
}

console.log(`\n✅ created=${created} updated=${updated} skipped(no email)=${skipped} failed=${failed}`);
if (skipped) {
  console.log('   Profiles without email need OAuth sign-in or manual Auth console entry.');
}
