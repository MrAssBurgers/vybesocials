#!/usr/bin/env node
/**
 * Verify Firestore user-data connectivity (live).
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/verify-firestore-connections.mjs
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initFirebaseAdmin } from './_adminInit.mjs';

const DELETED_AUTH_UIDS = new Set([
  '53e0076d-5163-46f5-b711-a58a03393744',
  'oXZZXoceCdOaCKekqNrDhCfJ90M2',
]);

const PROFILE_ID_CHECKS = [
  { col: 'posts', fields: ['author_id'] },
  { col: 'stories', fields: ['author_id', 'user_id'] },
  { col: 'messages', fields: ['sender_id'] },
  { col: 'conversation_members', fields: ['user_id'] },
  { col: 'follows', fields: ['follower_id', 'following_id'] },
  { col: 'friend_requests', fields: ['sender_id', 'recipient_id'] },
  { col: 'notifications', fields: ['user_id', 'actor_id'] },
  { col: 'push_tokens', fields: ['user_id'] },
  { col: 'user_roles', fields: ['user_id'] },
  { col: 'user_roles_auth', fields: ['user_id'] },
  { col: 'bug_reports', fields: ['reporter_id'] },
  { col: 'challenge_progress', fields: ['user_id'] },
  { col: 'message_reactions', fields: ['user_id'] },
  { col: 'login_streaks', fields: ['user_id'] },
  { col: 'user_locations', fields: ['user_id'] },
  { col: 'dismissed_profiles', fields: ['user_id'] },
];

const AUTH_UID_CHECKS = [
  { col: 'user_levels', fields: ['user_id'] },
  { col: 'user_badges', fields: ['user_id'] },
];

initFirebaseAdmin();
const db = getFirestore();
const auth = getAuth();

async function buildMaps() {
  const profiles = await db.collection('profiles').get();
  const profileIds = new Set(profiles.docs.map((d) => d.id));
  const authToProfile = new Map();
  const profileById = new Map();
  for (const p of profiles.docs) {
    profileById.set(p.id, p.data());
    if (p.data().user_id) authToProfile.set(p.data().user_id, p.id);
    authToProfile.set(p.id, p.id);
  }
  const idx = await db.collection('user_auth_index').get();
  for (const d of idx.docs) authToProfile.set(d.id, d.data().profile_id);
  return { profileIds, authToProfile, profileById };
}

function resolveProfileId(val, profileIds, authToProfile) {
  if (!val || DELETED_AUTH_UIDS.has(val)) return val ? 'DELETED_REMapped' : null;
  if (profileIds.has(val)) return val;
  return authToProfile.get(val) || null;
}

function resolveAuthUid(val, profileIds, authToProfile, profileById) {
  if (!val || DELETED_AUTH_UIDS.has(val)) return val ? 'DELETED_REMapped' : null;
  if (authToProfile.has(val) && !profileIds.has(val)) return val;
  if (profileIds.has(val)) return profileById.get(val)?.user_id || null;
  return authToProfile.has(val) ? val : null;
}

async function main() {
  const maps = await buildMaps();
  const { profileIds, authToProfile, profileById } = maps;

  let totalRefs = 0;
  let connected = 0;
  let orphans = 0;
  const orphanSamples = [];

  console.log('VYBE Firestore connectivity verify\n');

  for (const { col, fields } of PROFILE_ID_CHECKS) {
    const snap = await db.collection(col).get();
    if (!snap.size) continue;
    let colOrphans = 0;
    for (const doc of snap.docs) {
      for (const f of fields) {
        const v = doc.data()[f];
        if (!v) continue;
        totalRefs++;
        const resolved = resolveProfileId(v, profileIds, authToProfile);
        if (resolved && (profileIds.has(resolved) || resolved === 'DELETED_REMapped')) connected++;
        else {
          orphans++;
          colOrphans++;
          if (orphanSamples.length < 8) orphanSamples.push({ col, id: doc.id, field: f, value: v });
        }
      }
    }
    const mark = colOrphans ? '⚠' : '✓';
    console.log(`  ${mark} ${col.padEnd(24)} rows=${String(snap.size).padStart(4)} orphans=${colOrphans}`);
  }

  for (const { col, fields } of AUTH_UID_CHECKS) {
    const snap = await db.collection(col).get();
    if (!snap.size) continue;
    let colOrphans = 0;
    for (const doc of snap.docs) {
      for (const f of fields) {
        const v = doc.data()[f];
        if (!v) continue;
        totalRefs++;
        const resolved = resolveAuthUid(v, profileIds, authToProfile, profileById);
        if (resolved) connected++;
        else {
          orphans++;
          colOrphans++;
          if (orphanSamples.length < 8) orphanSamples.push({ col, id: doc.id, field: f, value: v });
        }
      }
    }
    const mark = colOrphans ? '⚠' : '✓';
    console.log(`  ${mark} ${col.padEnd(24)} rows=${String(snap.size).padStart(4)} orphans=${colOrphans}`);
  }

  const authUsers = await auth.listUsers(1000);
  let missingIndex = 0;
  for (const u of authUsers.users) {
    const idx = await db.collection('user_auth_index').doc(u.uid).get();
    if (!idx.exists) missingIndex++;
  }

  const pct = totalRefs ? ((connected / totalRefs) * 100).toFixed(2) : '100.00';
  console.log('\n── Summary ──');
  console.log(`  Social refs: ${connected}/${totalRefs} (${pct}%)`);
  console.log(`  Orphan refs: ${orphans}`);
  console.log(`  Auth users: ${authUsers.users.length}, missing index: ${missingIndex}`);
  console.log(`  Profiles: ${profileIds.size}`);

  if (orphanSamples.length) {
    console.log('\n  Orphan samples:');
    for (const s of orphanSamples) console.log(`    ${s.col}/${s.id} ${s.field}=${s.value}`);
  }

  const pass = orphans === 0 && missingIndex === 0;
  console.log(pass ? '\n✓ PASS — all user data connected' : '\n❌ FAIL — orphans or missing auth index');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
