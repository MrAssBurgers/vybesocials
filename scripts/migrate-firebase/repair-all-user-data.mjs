#!/usr/bin/env node
/**
 * Full user-data repair for Firebase migration:
 * 1. Link every Firebase Auth user → profiles.id via user_auth_index (email match)
 * 2. Sync profiles.user_id to current auth uid
 * 3. Normalize user_levels.user_id to auth uid (keep migrated XP)
 * 4. Re-run social repair (members, ghosts)
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/repair-all-user-data.mjs
 */
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { initFirebaseAdmin } from './_adminInit.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

initFirebaseAdmin();
const db = getFirestore();
const auth = getAuth();

const FOUNDER_EMAIL = 'barron.bakic@gmail.com';
const FOUNDER_USERNAMES = new Set(['mrassburgers', 'bakrix']);

async function findProfileForAuthUser(authUid, email) {
  const index = await db.collection('user_auth_index').doc(authUid).get();
  if (index.exists) {
    const profileId = String(index.data()?.profile_id || '');
    if (profileId) {
      const prof = await db.collection('profiles').doc(profileId).get();
      if (prof.exists) return { profileId, profileData: prof.data(), source: 'index' };
    }
  }

  const byUserId = await db.collection('profiles').where('user_id', '==', authUid).limit(1).get();
  if (!byUserId.empty) {
    const doc = byUserId.docs[0];
    return { profileId: doc.id, profileData: doc.data(), source: 'user_id' };
  }

  if (email) {
    const byEmail = await db.collection('profiles').where('email', '==', email).limit(5).get();
    if (!byEmail.empty) {
      const doc = byEmail.docs[0];
      return { profileId: doc.id, profileData: doc.data(), source: 'email' };
    }
  }

  if (email === FOUNDER_EMAIL) {
    for (const username of FOUNDER_USERNAMES) {
      const snap = await db.collection('profiles').where('username', '==', username).limit(1).get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        return { profileId: doc.id, profileData: doc.data(), source: 'founder' };
      }
    }
  }

  const byDocId = await db.collection('profiles').doc(authUid).get();
  if (byDocId.exists) {
    return { profileId: byDocId.id, profileData: byDocId.data(), source: 'doc_id' };
  }

  return null;
}

async function repairAuthLinks() {
  const authUsers = await auth.listUsers(1000);
  let linked = 0;
  let userIdSynced = 0;
  let levelsFixed = 0;
  let claimed = 0;

  for (const u of authUsers.users) {
    const email = (u.email || '').trim().toLowerCase();
    const match = await findProfileForAuthUser(u.uid, email);
    if (!match) continue;

    const { profileId, profileData } = match;
    const now = new Date().toISOString();

    if (!DRY_RUN) {
      await db.collection('user_auth_index').doc(u.uid).set({
        profile_id: profileId,
        username: profileData.username || null,
        email: email || profileData.email || null,
        updated_at: now,
      }, { merge: true });
    }
    linked++;

    if (profileData.user_id !== u.uid || (email && profileData.email !== email)) {
      if (!DRY_RUN) {
        await db.collection('profiles').doc(profileId).set({
          user_id: u.uid,
          email: email || profileData.email || null,
          updated_at: now,
        }, { merge: true });
      }
      userIdSynced++;
    }

    // Email claim: migrated profile exists under different uid (OAuth duplicate)
    if (email && profileData.user_id && profileData.user_id !== u.uid && profileId !== u.uid) {
      try {
        await auth.getUser(profileData.user_id);
      } catch {
        if (!DRY_RUN) {
          await db.collection('profiles').doc(profileId).set({
            user_id: u.uid,
            email,
            updated_at: now,
          }, { merge: true });
          claimed++;
        }
      }
    }

    const levelsByAuth = await db.collection('user_levels').where('user_id', '==', u.uid).limit(1).get();
    const levelsByProfile = await db.collection('user_levels').where('user_id', '==', profileId).limit(1).get();
    const levelDoc = levelsByAuth.docs[0] || levelsByProfile.docs[0];
    if (levelDoc && levelDoc.data().user_id !== u.uid) {
      if (!DRY_RUN) {
        await levelDoc.ref.set({ user_id: u.uid, profile_id: profileId, updated_at: now }, { merge: true });
      }
      levelsFixed++;
    }
  }

  console.log(`[auth-links] index/profile links: ${linked}${DRY_RUN ? ' (dry-run)' : ''}`);
  console.log(`[auth-links] profiles.user_id synced: ${userIdSynced}`);
  console.log(`[auth-links] reclaimed stale profiles: ${claimed}`);
  console.log(`[auth-links] user_levels.user_id fixed: ${levelsFixed}`);
}

async function printSummary() {
  const [profiles, authIndex, convMembers, messages, userLevels, posts] = await Promise.all([
    db.collection('profiles').count().get(),
    db.collection('user_auth_index').count().get(),
    db.collection('conversation_members').count().get(),
    db.collection('messages').count().get(),
    db.collection('user_levels').count().get(),
    db.collection('posts').count().get(),
  ]);
  console.log('\n[summary]');
  console.log('  profiles:', profiles.data().count);
  console.log('  user_auth_index:', authIndex.data().count);
  console.log('  conversation_members:', convMembers.data().count);
  console.log('  messages:', messages.data().count);
  console.log('  user_levels:', userLevels.data().count);
  console.log('  posts:', posts.data().count);

  const mrass = await db.collection('profiles').where('username', '==', 'mrassburgers').limit(1).get();
  if (!mrass.empty) {
    const p = mrass.docs[0];
    const uid = '703760a8-1245-4fc1-b242-32619ecc0ef3';
    const mem = await db.collection('conversation_members').where('user_id', '==', p.id).count().get();
    const lvl = await db.collection('user_levels').where('user_id', '==', uid).limit(1).get();
    console.log('  @mrassburgers DMs:', mem.data().count, 'level:', lvl.docs[0]?.data()?.current_level ?? 'none');
  }
}

async function main() {
  console.log(`Repair all user data${DRY_RUN ? ' (DRY RUN)' : ''}…`);
  await repairAuthLinks();

  if (!DRY_RUN) {
    const socialScript = join(__dirname, 'repair-firestore-social.mjs');
    const child = spawnSync(process.execPath, [socialScript], {
      stdio: 'inherit',
      env: process.env,
    });
    if (child.status !== 0) {
      process.exit(child.status ?? 1);
    }
  }

  await printSummary();
  console.log('\nDone. Deploy firestore:rules and Lovable Publish client fixes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
