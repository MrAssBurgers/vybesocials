#!/usr/bin/env node
/**
 * Remove junk conversation_members rows where user_id === conversation_id
 * (created by a 2026-06-22 migration bug) and strip the conversation's own id
 * from conversations.member_ids arrays.
 *
 * Every mutated doc is backed up to scripts/migrate-firebase/backups/ first.
 *
 * Usage:
 *   node scripts/migrate-firebase/cleanup-selfref-members.mjs           # dry run
 *   node scripts/migrate-firebase/cleanup-selfref-members.mjs --apply   # execute
 */
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initFirebaseAdmin } from './_adminInit.mjs';

const APPLY = process.argv.includes('--apply');
const __dirname = dirname(fileURLToPath(import.meta.url));

initFirebaseAdmin();
const db = getFirestore();

async function main() {
  const profiles = await db.collection('profiles').get();
  const profileIds = new Set(profiles.docs.map((d) => d.id));
  const idx = await db.collection('user_auth_index').get();
  const authIds = new Set(idx.docs.map((d) => d.id));

  const members = await db.collection('conversation_members').get();
  const junkMembers = [];
  for (const doc of members.docs) {
    const d = doc.data();
    const uid = String(d.user_id || '');
    const cid = String(d.conversation_id || '');
    // Strict junk criteria: self-referencing row whose "user" is not a real user.
    if (uid && uid === cid && !profileIds.has(uid) && !authIds.has(uid)) {
      junkMembers.push({ id: doc.id, data: d });
    }
  }

  const conversations = await db.collection('conversations').get();
  const convsToPatch = [];
  for (const doc of conversations.docs) {
    const ids = doc.data().member_ids;
    if (Array.isArray(ids) && ids.includes(doc.id)) {
      convsToPatch.push({ id: doc.id, member_ids: ids });
    }
  }

  console.log(`junk conversation_members rows: ${junkMembers.length}`);
  console.log(`conversations with own id in member_ids: ${convsToPatch.length}`);

  if (!APPLY) {
    console.log('\nDry run — re-run with --apply to execute.');
    return;
  }

  const backupDir = join(__dirname, 'backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `selfref-members-${Date.now()}.json`);
  writeFileSync(backupPath, JSON.stringify({ junkMembers, convsToPatch }, null, 2));
  console.log(`backup written: ${backupPath}`);

  for (const row of junkMembers) {
    await db.collection('conversation_members').doc(row.id).delete();
  }
  console.log(`deleted ${junkMembers.length} junk membership rows`);

  for (const conv of convsToPatch) {
    await db.collection('conversations').doc(conv.id).update({
      member_ids: FieldValue.arrayRemove(conv.id),
    });
  }
  console.log(`patched member_ids on ${convsToPatch.length} conversations`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
