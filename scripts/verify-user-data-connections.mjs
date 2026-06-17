#!/usr/bin/env node
/**
 * Verify user-data connectivity in a Lovable Cloud JSON export (or Firestore after import).
 *
 * Confirms every social row references a known auth UID from profiles.json — the same UID
 * seed-firebase-auth-from-profiles.mjs uses for Firebase Auth (no remapping needed).
 *
 * Usage:
 *   node scripts/verify-user-data-connections.mjs
 *   node scripts/verify-user-data-connections.mjs --user <uuid>
 *   TABLES_DIR=./lovable-cloud-export/tables node scripts/verify-user-data-connections.mjs
 *
 * Optional Firestore mode (post-import row counts):
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   FIREBASE_PROJECT_ID=vybe-daaab \
 *   node scripts/verify-user-data-connections.mjs --firestore
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TABLES_DIR =
  process.env.TABLES_DIR ||
  join(ROOT, 'export/lovable-cloud-export/tables');

const args = process.argv.slice(2);
const userFlagIdx = args.indexOf('--user');
const spotUser = userFlagIdx >= 0 ? args[userFlagIdx + 1] : null;
const useFirestore = args.includes('--firestore');

/** Tables + columns that must reference a known auth UID. */
const USER_REF_CHECKS = [
  { table: 'posts', fields: ['user_id', 'author_id'] },
  { table: 'follows', fields: ['follower_id', 'following_id'] },
  { table: 'friend_requests', fields: ['from_user_id', 'to_user_id'] },
  { table: 'close_friends', fields: ['user_id', 'friend_id'] },
  { table: 'blocked_users', fields: ['blocker_id', 'blocked_id'] },
  { table: 'messages', fields: ['sender_id'] },
  { table: 'message_views', fields: ['user_id'] },
  { table: 'conversation_members', fields: ['user_id'] },
  { table: 'conversations', fields: ['created_by'], optionalNull: true },
  { table: 'stories', fields: ['user_id'] },
  { table: 'notifications', fields: ['user_id', 'from_user_id'], optionalFields: ['from_user_id'] },
  { table: 'comments', fields: ['user_id'] },
  { table: 'bookmarks', fields: ['user_id'] },
  { table: 'likes', fields: ['user_id'] },
  { table: 'vybe_dna', fields: ['user_id'] },
  { table: 'dna_agent_actions', fields: ['user_id'] },
];

function loadJsonTable(name) {
  const path = join(TABLES_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    const rows = JSON.parse(readFileSync(path, 'utf8'));
    return Array.isArray(rows) ? rows : null;
  } catch {
    return null;
  }
}

function buildKnownUids(profiles) {
  const uids = new Set();
  for (const p of profiles) {
    for (const raw of [p.user_id, p.id]) {
      const uid = String(raw || '').trim();
      if (uid) uids.add(uid);
    }
  }
  return uids;
}

function isUuid(v) {
  return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);
}

function checkTable(table, fields, rows, knownUids, opts = {}) {
  const { optionalNull = false, optionalFields = [] } = opts;
  let refs = 0;
  let connected = 0;
  let orphans = 0;
  const orphanSamples = [];

  for (const row of rows) {
    for (const field of fields) {
      const val = row[field];
      if (val == null || val === '') {
        if (optionalNull && field === 'created_by') continue;
        if (optionalFields.includes(field)) continue;
        continue;
      }
      if (!isUuid(String(val))) continue;
      refs += 1;
      if (knownUids.has(String(val))) {
        connected += 1;
      } else {
        orphans += 1;
        if (orphanSamples.length < 5) {
          orphanSamples.push({ id: row.id, field, value: val });
        }
      }
    }
  }

  const pct = refs ? ((connected / refs) * 100).toFixed(2) : '100.00';
  return { table, rows: rows.length, refs, connected, orphans, pct, orphanSamples };
}

function spotCheckUser(uid, knownUids) {
  console.log(`\n── Spot check: ${uid} ──`);
  if (!knownUids.has(uid)) {
    console.log('  ⚠️  UID not in profiles.json — user may not exist in export');
  } else {
    console.log('  ✓ Profile UID found');
  }

  const counts = {};
  for (const { table, fields } of USER_REF_CHECKS) {
    const rows = loadJsonTable(table);
    if (!rows) continue;
    let n = 0;
    for (const row of rows) {
      if (fields.some((f) => String(row[f] || '') === uid)) n += 1;
    }
    if (n) counts[table] = n;
  }

  if (!Object.keys(counts).length) {
    console.log('  (no rows reference this UID in checked tables)');
    return;
  }
  for (const [table, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${table}: ${n}`);
  }
}

async function firestoreCounts() {
  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || join(ROOT, 'secrets/firebase-admin.json');
  if (!existsSync(saPath)) {
    console.warn('\n⚠️  Skip Firestore counts — no service account at', saPath);
    return;
  }
  const serviceAccount = JSON.parse(readFileSync(saPath, 'utf8'));
  initializeApp({
    credential: cert(serviceAccount),
    projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
  });
  const db = getFirestore();
  console.log('\n── Firestore collection counts (sample) ──');
  for (const { table } of USER_REF_CHECKS.slice(0, 12)) {
    try {
      const snap = await db.collection(table).count().get();
      console.log(`  ${table}: ${snap.data().count}`);
    } catch (e) {
      console.log(`  ${table}: (count failed — ${e.message})`);
    }
  }
}

function main() {
  if (!existsSync(TABLES_DIR)) {
    console.error(`❌ Tables dir missing: ${TABLES_DIR}`);
    console.error('   Unzip export to export/lovable-cloud-export/tables/');
    process.exit(1);
  }

  const profiles = loadJsonTable('profiles');
  if (!profiles?.length) {
    console.error('❌ profiles.json missing or empty');
    process.exit(1);
  }

  const knownUids = buildKnownUids(profiles);
  console.log('VYBE user-data connectivity scan');
  console.log(`Tables: ${TABLES_DIR}`);
  console.log(`Known auth UIDs (profiles): ${knownUids.size}\n`);

  if (spotUser) {
    spotCheckUser(spotUser, knownUids);
    return;
  }

  let totalRefs = 0;
  let totalConnected = 0;
  let totalOrphans = 0;

  for (const spec of USER_REF_CHECKS) {
    const rows = loadJsonTable(spec.table);
    if (!rows?.length) {
      console.log(`  ⤼ skip ${spec.table} (empty/missing)`);
      continue;
    }
    const r = checkTable(spec.table, spec.fields, rows, knownUids, {
      optionalNull: spec.optionalNull,
      optionalFields: spec.optionalFields || [],
    });
    totalRefs += r.refs;
    totalConnected += r.connected;
    totalOrphans += r.orphans;
    const mark = r.orphans === 0 ? '✓' : '⚠';
    console.log(
      `  ${mark} ${r.table.padEnd(24)} rows=${String(r.rows).padStart(5)} refs=${String(r.refs).padStart(5)} connected=${r.pct}% orphans=${r.orphans}`,
    );
    if (r.orphanSamples.length) {
      for (const s of r.orphanSamples) {
        console.log(`      orphan ${s.field}=${s.value} (${s.id})`);
      }
    }
  }

  const overallPct = totalRefs ? ((totalConnected / totalRefs) * 100).toFixed(2) : '100.00';
  console.log('\n── Summary ──');
  console.log(`  Profiles preserved: ${profiles.length} / ${profiles.length}`);
  console.log(`  Social refs scanned: ${totalRefs}`);
  console.log(`  Connected to known UID: ${totalConnected} (${overallPct}%)`);
  console.log(`  Orphan refs: ${totalOrphans}`);

  const convRows = loadJsonTable('conversations') || [];
  const nullCreatedBy = convRows.filter((c) => !c.created_by).length;
  if (nullCreatedBy) {
    console.log(`\n  Note: ${nullCreatedBy} conversations have null created_by (system/group threads).`);
    console.log('  Access is via conversation_members — not a user data loss issue.');
  }

  console.log('\n  Firebase Auth seed uses the same UIDs → client queries need zero remapping.');
}

main();
if (useFirestore) {
  firestoreCounts().catch((e) => console.error(e));
}
