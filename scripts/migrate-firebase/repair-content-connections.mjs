#!/usr/bin/env node
/**
 * Repair ALL content → user/profile connections in Firestore.
 *
 * - Remap deleted duplicate auth UIDs (bakrix / oxzz) → mrassburgers
 * - Remap auth UID → profiles.id where social rows expect profile ids
 * - Backfill denormalized author fields on posts/stories
 * - Clean orphan rows pointing at deleted profiles
 * - Normalize user_levels / user_badges / roles / push tokens
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/repair-content-connections.mjs [--dry-run]
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from './_adminInit.mjs';

const DRY_RUN = process.argv.includes('--dry-run');

const MRASS_PROFILE_ID = 'e78010f2-d5f1-428b-b5df-8fc6b768772d';
const MRASS_AUTH_UID = '703760a8-1245-4fc1-b242-32619ecc0ef3';

/** Deleted Firebase Auth users from merge-founder-accounts.mjs */
const DELETED_AUTH_UIDS = new Set([
  '53e0076d-5163-46f5-b711-a58a03393744', // bakrix
  'oXZZXoceCdOaCKekqNrDhCfJ90M2',
]);

/** Fields that must be profiles.id */
const PROFILE_ID_FIELDS = [
  { collection: 'posts', fields: ['author_id'] },
  { collection: 'stories', fields: ['author_id', 'user_id'] },
  { collection: 'messages', fields: ['sender_id'] },
  { collection: 'conversation_members', fields: ['user_id'] },
  { collection: 'comments', fields: ['author_id', 'user_id'] },
  { collection: 'bookmarks', fields: ['user_id'] },
  { collection: 'follows', fields: ['follower_id', 'following_id'] },
  { collection: 'friend_requests', fields: ['sender_id', 'recipient_id'] },
  { collection: 'blocked_users', fields: ['blocker_id', 'blocked_id'] },
  { collection: 'close_friends', fields: ['user_id', 'friend_id'] },
  { collection: 'notifications', fields: ['user_id', 'from_user_id', 'actor_id'] },
  { collection: 'post_views', fields: ['viewer_id', 'user_id'] },
  { collection: 'story_views', fields: ['viewer_id', 'user_id'] },
  { collection: 'likes', fields: ['user_id'] },
  { collection: 'post_reactions', fields: ['user_id'] },
  { collection: 'comment_likes', fields: ['user_id'] },
  { collection: 'hidden_conversations', fields: ['user_id'] },
  { collection: 'trashed_conversations', fields: ['user_id'] },
  { collection: 'dm_settings', fields: ['user_id'] },
  { collection: 'push_tokens', fields: ['user_id'] },
  { collection: 'user_roles', fields: ['user_id'] },
  { collection: 'user_roles_auth', fields: ['user_id'] },
  { collection: 'user_locations', fields: ['user_id'] },
  { collection: 'challenge_progress', fields: ['user_id'] },
  { collection: 'dismissed_profiles', fields: ['user_id', 'dismissed_id'] },
  { collection: 'invites', fields: ['inviter_id', 'user_id'] },
  { collection: 'friend_drops', fields: ['sender_id', 'user_id'] },
  { collection: 'listings', fields: ['seller_id', 'user_id'] },
  { collection: 'listing_favorites', fields: ['user_id'] },
  { collection: 'message_reactions', fields: ['user_id'] },
  { collection: 'communities', fields: ['owner_id'] },
  { collection: 'channel_messages', fields: ['author_id'] },
  { collection: 'group_members', fields: ['user_id'] },
  { collection: 'bug_reports', fields: ['reporter_id'] },
  { collection: 'feature_requests', fields: ['user_id'] },
  { collection: 'feature_votes', fields: ['user_id'] },
  { collection: 'capture_events', fields: ['user_id'] },
  { collection: 'contact_hashes', fields: ['user_id'] },
  { collection: 'gifted_premium', fields: ['recipient_id', 'giver_id'] },
  { collection: 'creator_profiles', fields: ['user_id'] },
];

/** Fields that store Firebase Auth uid (not profile id) */
const AUTH_UID_FIELDS = [
  { collection: 'user_levels', fields: ['user_id'] },
  { collection: 'user_badges', fields: ['user_id'] },
  { collection: 'login_streaks', fields: ['user_id'] },
];

initFirebaseAdmin();
const db = getFirestore();

async function buildMaps() {
  const profilesSnap = await db.collection('profiles').get();
  const profileIds = new Set(profilesSnap.docs.map((d) => d.id));
  const profileById = new Map();
  const authToProfile = new Map();

  for (const doc of profilesSnap.docs) {
    const data = doc.data();
    profileById.set(doc.id, data);
    if (data.user_id) authToProfile.set(data.user_id, doc.id);
    authToProfile.set(doc.id, doc.id);
  }

  const indexSnap = await db.collection('user_auth_index').get();
  for (const doc of indexSnap.docs) {
    const profileId = doc.data()?.profile_id;
    if (profileId) authToProfile.set(doc.id, profileId);
  }

  return { profileIds, profileById, authToProfile };
}

function toProfileId(value, profileIds, authToProfile) {
  if (!value) return null;
  if (DELETED_AUTH_UIDS.has(value)) return MRASS_PROFILE_ID;
  if (profileIds.has(value)) return value;
  if (authToProfile.has(value)) return authToProfile.get(value);
  return null;
}

function toAuthUid(value, profileIds, authToProfile, profileById) {
  if (!value) return null;
  if (DELETED_AUTH_UIDS.has(value)) return MRASS_AUTH_UID;
  if (profileIds.has(value)) {
    const prof = profileById.get(value);
    return prof?.user_id || value;
  }
  if (authToProfile.has(value)) {
    const pid = authToProfile.get(value);
    const prof = profileById.get(pid);
    return value.length === 36 && !profileIds.has(value) ? value : (prof?.user_id || value);
  }
  // Already a live auth uid linked in index
  if ([...authToProfile.keys()].includes(value)) return value;
  return null;
}

async function repairProfileIdFields(maps) {
  const { profileIds, authToProfile } = maps;
  let remapped = 0;
  let orphans = 0;

  for (const { collection, fields } of PROFILE_ID_FIELDS) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const updates = {};

      for (const field of fields) {
        const val = data[field];
        if (!val) continue;
        const resolved = toProfileId(val, profileIds, authToProfile);
        if (resolved && resolved !== val) {
          updates[field] = resolved;
        } else if (!resolved && !profileIds.has(val)) {
          orphans++;
          console.warn(`[orphan] ${collection}/${doc.id} ${field}=${val}`);
        }
      }

      if (Object.keys(updates).length) {
        if (!DRY_RUN) {
          await doc.ref.set({ ...updates, updated_at: new Date().toISOString() }, { merge: true });
        }
        remapped += Object.keys(updates).length;
      }
    }
  }

  console.log(`[profile-ids] remapped ${remapped} field(s), orphans logged: ${orphans}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function repairAuthUidFields(maps) {
  const { profileIds, authToProfile, profileById } = maps;
  let remapped = 0;

  for (const { collection, fields } of AUTH_UID_FIELDS) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      const updates = {};

      for (const field of fields) {
        const val = data[field];
        if (!val) continue;
        // profile id stored where auth uid expected
        if (profileIds.has(val) && val !== profileById.get(val)?.user_id) {
          const authUid = profileById.get(val)?.user_id;
          if (authUid && authUid !== val) updates[field] = authUid;
        } else if (DELETED_AUTH_UIDS.has(val)) {
          updates[field] = MRASS_AUTH_UID;
        }
      }

      if (Object.keys(updates).length) {
        if (!DRY_RUN) {
          await doc.ref.set({ ...updates, updated_at: new Date().toISOString() }, { merge: true });
        }
        remapped += Object.keys(updates).length;
      }
    }
  }

  console.log(`[auth-uids] remapped ${remapped} field(s)${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function cleanupOrphans(maps) {
  const { profileIds, authToProfile } = maps;
  let deleted = 0;

  const deleteIfOrphan = async (collection, doc, fields) => {
    for (const field of fields) {
      const val = doc.data()[field];
      if (!val) continue;
      const resolved = toProfileId(val, profileIds, authToProfile);
      if (!resolved && !profileIds.has(val) && !DELETED_AUTH_UIDS.has(val)) {
        if (!DRY_RUN) await doc.ref.delete();
        deleted++;
        console.log(`[delete] ${collection}/${doc.id} orphan ${field}=${val}`);
        return;
      }
    }
  };

  // user_badges with deleted profile
  const badges = await db.collection('user_badges').get();
  for (const doc of badges.docs) {
    await deleteIfOrphan('user_badges', doc, ['user_id']);
  }

  // duplicate low-level rows for deleted auth users
  for (const uid of DELETED_AUTH_UIDS) {
    const levels = await db.collection('user_levels').where('user_id', '==', uid).get();
    for (const doc of levels.docs) {
      if (!DRY_RUN) await doc.ref.delete();
      deleted++;
      console.log(`[delete] user_levels/${doc.id} stale uid ${uid}`);
    }
    const levelByDocId = await db.collection('user_levels').doc(uid).get();
    if (levelByDocId.exists) {
      if (!DRY_RUN) await levelByDocId.ref.delete();
      deleted++;
      console.log(`[delete] user_levels/${uid} stale doc id`);
    }
  }

  // duplicate owner role rows for deleted auth uids
  for (const uid of DELETED_AUTH_UIDS) {
    for (const col of ['user_roles', 'user_roles_auth']) {
      const snap = await db.collection(col).where('user_id', '==', uid).get();
      for (const doc of snap.docs) {
        if (!DRY_RUN) await doc.ref.delete();
        deleted++;
        console.log(`[delete] ${col}/${doc.id} stale uid ${uid}`);
      }
      const ownerDoc = await db.collection(col).doc(`${uid}_owner`).get();
      if (ownerDoc.exists) {
        if (!DRY_RUN) await ownerDoc.ref.delete();
        deleted++;
        console.log(`[delete] ${col}/${uid}_owner`);
      }
    }
  }

  console.log(`[cleanup] removed ${deleted} orphan/stale row(s)${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function backfillPostAuthors(maps) {
  const { profileById } = maps;
  const posts = await db.collection('posts').get();
  let updated = 0;

  for (const doc of posts.docs) {
    const data = doc.data();
    const authorId = data.author_id;
    if (!authorId) continue;

    const profile = profileById.get(authorId);
    if (!profile) continue;

    const patch = {};
    if (profile.username && data.author_username !== profile.username) patch.author_username = profile.username;
    if (profile.avatar_url != null && data.author_avatar_url !== profile.avatar_url) {
      patch.author_avatar_url = profile.avatar_url;
    }
    if (profile.display_name != null && data.author_display_name !== profile.display_name) {
      patch.author_display_name = profile.display_name;
    }
    if (profile.is_verified != null && data.author_is_verified !== profile.is_verified) {
      patch.author_is_verified = profile.is_verified;
    }

    if (Object.keys(patch).length) {
      if (!DRY_RUN) await doc.ref.set(patch, { merge: true });
      updated++;
    }
  }

  console.log(`[posts] author metadata ${updated}/${posts.size} updated${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function syncStoryAuthors(maps) {
  const { profileById } = maps;
  const stories = await db.collection('stories').get();
  let updated = 0;

  for (const doc of stories.docs) {
    const data = doc.data();
    const authorId = toProfileId(data.author_id || data.user_id, maps.profileIds, maps.authToProfile);
    if (!authorId) continue;
    const profile = profileById.get(authorId);
    if (!profile) continue;

    const patch = {};
    if (data.author_id !== authorId) patch.author_id = authorId;
    if (data.user_id !== authorId) patch.user_id = authorId;
    if (profile.username && data.author_username !== profile.username) patch.author_username = profile.username;
    if (profile.avatar_url != null && data.author_avatar_url !== profile.avatar_url) {
      patch.author_avatar_url = profile.avatar_url;
    }

    if (Object.keys(patch).length) {
      if (!DRY_RUN) await doc.ref.set(patch, { merge: true });
      updated++;
    }
  }

  console.log(`[stories] synced ${updated}/${stories.size}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function verifyAll(maps) {
  const { profileIds, authToProfile, profileById } = maps;
  let totalRefs = 0;
  let connected = 0;
  let orphans = 0;

  const isConnectedProfileField = (val) => {
    if (!val) return true;
    totalRefs++;
    if (profileIds.has(val)) { connected++; return true; }
    if (toProfileId(val, profileIds, authToProfile)) { connected++; return true; }
    orphans++;
    return false;
  };

  const isConnectedAuthField = (val) => {
    if (!val) return true;
    totalRefs++;
    if (profileIds.has(val) || authToProfile.has(val) || DELETED_AUTH_UIDS.has(val)) {
      connected++;
      return true;
    }
    const prof = profileById.get(val);
    if (prof?.user_id) { connected++; return true; }
    orphans++;
    return false;
  };

  for (const { collection, fields } of PROFILE_ID_FIELDS) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      for (const f of fields) isConnectedProfileField(doc.data()[f]);
    }
  }
  for (const { collection, fields } of AUTH_UID_FIELDS) {
    const snap = await db.collection(collection).get();
    for (const doc of snap.docs) {
      for (const f of fields) isConnectedAuthField(doc.data()[f]);
    }
  }

  const pct = totalRefs ? ((connected / totalRefs) * 100).toFixed(2) : '100.00';
  console.log(`[verify] ${connected}/${totalRefs} refs connected (${pct}%), orphans=${orphans}`);
  return orphans === 0;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — content connections' : 'LIVE — full content connection repair');
  const maps = await buildMaps();
  await repairProfileIdFields(maps);
  await repairAuthUidFields(maps);
  await cleanupOrphans(maps);
  await backfillPostAuthors(maps);
  await syncStoryAuthors(maps);
  const ok = await verifyAll(maps);
  console.log(ok ? '✓ All user data connections verified' : '⚠ Some orphan refs remain — see warnings above');
  console.log('Done.');
  if (!ok && !DRY_RUN) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
