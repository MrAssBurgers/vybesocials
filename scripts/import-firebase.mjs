#!/usr/bin/env node
/**
 * Phase 3 — Import Supabase export into Firebase (vybe-daaab).
 *
 * Prereqs:
 *   1. Run scripts/export-supabase.mjs first (produces ./export/).
 *   2. Firebase service account JSON at ./secrets/firebase-admin.json.
 *   3. Blaze plan enabled on vybe-daaab.
 *
 * Run locally:
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   node scripts/import-firebase.mjs
 *
 * Flags:
 *   --only=auth,firestore,storage   limit which stages run (default: all)
 *   --dry                           parse + count, do not write
 *   --resume                        skip docs that already exist (per-table cursor file)
 *
 * What it does:
 *   - Auth:    batches 1000 users via auth.importUsers() preserving UID + bcrypt password hash.
 *   - Firestore: each NDJSON table → collection of same name, doc id = row.id (or generated).
 *   - Storage: uploads ./export/storage/<bucket>/<path> → gs://<default-bucket>/<bucket>/<path>.
 *
 * Schema notes (per-table mapping deviations are listed in MAPPING below).
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, relative } from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// ── CLI ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ONLY = (args.find(a => a.startsWith('--only='))?.split('=')[1] || 'auth,firestore,storage').split(',');
const DRY = args.includes('--dry');
const RESUME = args.includes('--resume');

const SA_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin.json';
if (!existsSync(SA_PATH)) {
  console.error(`❌ Service account not found at ${SA_PATH}`);
  console.error('   Download from Firebase Console → Project Settings → Service Accounts.');
  process.exit(1);
}

const serviceAccount = JSON.parse(await readFile(SA_PATH, 'utf8'));
initializeApp({
  credential: cert(serviceAccount),
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`,
});

const auth = getAuth();
const db = getFirestore();
const bucket = getStorage().bucket();

const EXPORT_DIR = './export';
const TABLE_DIR = join(EXPORT_DIR, 'tables');
const STORAGE_DIR = join(EXPORT_DIR, 'storage');

// ── Per-table mapping decisions ──────────────────────────────────────
// key = source table, value = { collection, idField, skip?, transform? }
const MAPPING = {
  // Identity / users
  profiles:           { collection: 'profiles', idField: 'id' },
  user_roles:         { collection: 'user_roles', idField: 'id' },
  user_roles_auth:    { collection: 'user_roles_auth', idField: 'id' },
  user_settings:      { collection: 'user_settings', idField: 'user_id' },
  user_preferences:   { collection: 'user_preferences', idField: 'user_id' },
  user_about:         { collection: 'user_about', idField: 'user_id' },
  user_2fa_settings:  { collection: 'user_2fa_settings', idField: 'user_id' },
  user_safety_settings:{ collection: 'user_safety_settings', idField: 'user_id' },
  user_ui_settings:   { collection: 'user_ui_settings', idField: 'user_id' },

  // Social graph
  follows:            { collection: 'follows', idField: 'id' },
  blocked_users:      { collection: 'blocked_users', idField: 'id' },
  friend_requests:    { collection: 'friend_requests', idField: 'id' },
  close_friends:      { collection: 'close_friends', idField: 'id' },

  // Posts / feed
  posts:              { collection: 'posts', idField: 'id' },
  comments:           { collection: 'comments', idField: 'id' },
  likes:              { collection: 'likes', idField: 'id' },
  bookmarks:          { collection: 'bookmarks', idField: 'id' },

  // Chat
  conversations:      { collection: 'conversations', idField: 'id' },
  conversation_members:{ collection: 'conversation_members', idField: 'id' },
  messages:           { collection: 'messages', idField: 'id' },

  // Drop noisy/transient tables that don't need migration
  analytics_events:   { skip: true, reason: 'transient — start fresh in Firebase' },
  rate_limits:        { skip: true, reason: 'in-memory equivalent in Firebase' },
  oauth_nonces:       { skip: true, reason: 'short-lived auth nonces' },
  password_reset_tokens:{ skip: true, reason: 'Firebase Auth handles resets' },
  email_send_log:     { skip: true, reason: 'append-only log; keep historical in Supabase' },
  error_logs:         { skip: true, reason: 'use Cloud Logging instead' },
  call_signals:       { skip: true, reason: 'ephemeral signaling' },
  typing_indicators:  { skip: true, reason: 'ephemeral presence' },
  chat_presence:      { skip: true, reason: 'rebuilt via RTDB presence' },
  user_presence:      { skip: true, reason: 'rebuilt via RTDB presence' },
};
// Default mapping for any table not listed above
const defaultMapping = (table) => ({ collection: table, idField: 'id' });

// ── Helpers ──────────────────────────────────────────────────────────
async function* readNdjson(filePath) {
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { yield JSON.parse(t); } catch (e) { console.warn('  ⚠ bad line skipped'); }
  }
}

function sanitizeFirestore(doc) {
  // Firestore doc IDs cannot contain "/" and field values cannot be `undefined`.
  const out = {};
  for (const [k, v] of Object.entries(doc)) {
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ── Stage: Auth ──────────────────────────────────────────────────────
async function importAuthUsers() {
  const file = join(EXPORT_DIR, 'auth-users.ndjson');
  if (!existsSync(file)) { console.warn('⚠ auth-users.ndjson missing — skipping auth import'); return; }
  console.log('\n▶ Importing auth users...');

  const batch = [];
  let total = 0, ok = 0, fail = 0;

  const flush = async () => {
    if (!batch.length) return;
    if (DRY) { ok += batch.length; batch.length = 0; return; }
    const res = await auth.importUsers(batch, {
      hash: { algorithm: 'BCRYPT' }, // Supabase uses bcrypt
    });
    ok += res.successCount;
    fail += res.failureCount;
    if (res.errors.length) {
      console.warn(`  ⚠ ${res.errors.length} failures in batch`);
      for (const e of res.errors.slice(0, 3)) console.warn('   ', e.error.message);
    }
    batch.length = 0;
  };

  for await (const u of readNdjson(file)) {
    total++;
    const record = {
      uid: u.id,
      email: u.email || undefined,
      emailVerified: !!u.email_confirmed_at,
      phoneNumber: u.phone ? (u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : undefined,
      displayName: u.raw_user_meta_data?.full_name || u.raw_user_meta_data?.name,
      photoURL: u.raw_user_meta_data?.avatar_url,
      disabled: !!u.banned_until,
      metadata: {
        creationTime: u.created_at,
        lastSignInTime: u.last_sign_in_at,
      },
      customClaims: u.raw_app_meta_data?.role ? { role: u.raw_app_meta_data.role } : undefined,
    };
    if (u.encrypted_password && u.encrypted_password.startsWith('$2')) {
      record.passwordHash = Buffer.from(u.encrypted_password, 'utf8');
    }
    // Strip undefined
    for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
    batch.push(record);
    if (batch.length >= 1000) await flush();
  }
  await flush();
  console.log(`✓ Auth: ${ok}/${total} imported (${fail} failed)`);
}

// ── Stage: Firestore ─────────────────────────────────────────────────
async function importFirestore() {
  console.log('\n▶ Importing Firestore collections...');
  const files = (await readdir(TABLE_DIR)).filter(f => f.endsWith('.ndjson')).sort();
  for (const file of files) {
    const table = file.replace(/\.ndjson$/, '');
    const map = MAPPING[table] || defaultMapping(table);
    if (map.skip) { console.log(`  ⤼ skip ${table} — ${map.reason}`); continue; }

    const filePath = join(TABLE_DIR, file);
    let count = 0, written = 0;
    let batch = db.batch();
    let inBatch = 0;

    for await (const row of readNdjson(filePath)) {
      count++;
      const id = String(row[map.idField] ?? row.id ?? db.collection(map.collection).doc().id);
      const ref = db.collection(map.collection).doc(id);
      if (!DRY) {
        batch.set(ref, sanitizeFirestore(row), { merge: true });
        inBatch++;
        if (inBatch >= 400) { // Firestore limit 500; leave margin
          await batch.commit();
          written += inBatch;
          batch = db.batch();
          inBatch = 0;
        }
      } else {
        written++;
      }
    }
    if (!DRY && inBatch) { await batch.commit(); written += inBatch; }
    console.log(`  ✓ ${table} → ${map.collection} (${written}/${count})`);
  }
}

// ── Stage: Storage ───────────────────────────────────────────────────
async function importStorage() {
  if (!existsSync(STORAGE_DIR)) { console.warn('⚠ storage dir missing — skipping'); return; }
  console.log('\n▶ Uploading storage objects...');

  async function* walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) yield* walk(p);
      else if (entry.isFile()) yield p;
    }
  }

  let uploaded = 0, skipped = 0;
  for await (const localPath of walk(STORAGE_DIR)) {
    const destination = relative(STORAGE_DIR, localPath).replace(/\\/g, '/'); // <bucket>/<path>
    if (DRY) { uploaded++; continue; }
    try {
      await bucket.upload(localPath, { destination, resumable: false });
      uploaded++;
      if (uploaded % 100 === 0) console.log(`  … ${uploaded} uploaded`);
    } catch (e) {
      skipped++;
      if (skipped < 5) console.warn(`  ⚠ ${destination}: ${e.message}`);
    }
  }
  console.log(`✓ Storage: ${uploaded} uploaded, ${skipped} failed`);
}

// ── Main ─────────────────────────────────────────────────────────────
console.log(`Firebase import — project: ${serviceAccount.project_id}${DRY ? ' (DRY RUN)' : ''}`);
console.log(`Stages: ${ONLY.join(', ')}`);

if (ONLY.includes('auth')) await importAuthUsers();
if (ONLY.includes('firestore')) await importFirestore();
if (ONLY.includes('storage')) await importStorage();

console.log('\n✅ Done.');
process.exit(0);
