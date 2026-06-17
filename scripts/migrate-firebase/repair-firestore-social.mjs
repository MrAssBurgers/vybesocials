#!/usr/bin/env node
/**
 * Repair Firestore social data after Firebase migration:
 * 1. Seed user_auth_index (auth uid → profiles.id) for security rules
 * 2. Backfill conversation_members from message senders
 * 3. Delete ghost conversations (no members, no messages)
 * 4. Delete posts with missing author profiles
 *
 * Usage: GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json node scripts/migrate-firebase/repair-firestore-social.mjs
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) initializeApp();
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry-run');

async function seedUserAuthIndex() {
  const profiles = await db.collection('profiles').get();
  let written = 0;
  const batch = db.batch();
  let ops = 0;

  for (const doc of profiles.docs) {
    const data = doc.data();
    const profileId = doc.id;
    const authUid = data.user_id || profileId;
    if (!authUid) continue;

    const ref = db.collection('user_auth_index').doc(authUid);
    batch.set(ref, {
      profile_id: profileId,
      username: data.username || null,
      updated_at: new Date().toISOString(),
    }, { merge: true });
    written++;
    ops++;
    if (ops >= 400) {
      if (!DRY_RUN) await batch.commit();
      ops = 0;
    }
  }
  if (ops > 0 && !DRY_RUN) await batch.commit();
  console.log(`[auth-index] ${written} mappings${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function backfillConversationMembers() {
  const convs = await db.collection('conversations').get();
  let created = 0;

  for (const conv of convs.docs) {
    const cid = conv.id;
    const existing = await db.collection('conversation_members').where('conversation_id', '==', cid).get();
    if (!existing.empty) continue;

    const msgs = await db.collection('messages').where('conversation_id', '==', cid).limit(50).get();
    if (msgs.empty) continue;

    const senderIds = [...new Set(msgs.docs.map((m) => m.data().sender_id).filter(Boolean))];
    const now = new Date().toISOString();

    for (const profileId of senderIds) {
      const docId = `${cid}_${profileId}`;
      const ref = db.collection('conversation_members').doc(docId);
      const snap = await ref.get();
      if (snap.exists) continue;

      if (!DRY_RUN) {
        await ref.set({
          id: docId,
          conversation_id: cid,
          user_id: profileId,
          role: 'member',
          is_muted: false,
          is_pinned: false,
          last_read_at: null,
          created_at: now,
        });
      }
      created++;
    }
  }
  console.log(`[members-backfill] ${created} member rows${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function deleteGhostConversations() {
  const convs = await db.collection('conversations').get();
  let deleted = 0;

  for (const conv of convs.docs) {
    const cid = conv.id;
    const [mem, msgs] = await Promise.all([
      db.collection('conversation_members').where('conversation_id', '==', cid).limit(1).get(),
      db.collection('messages').where('conversation_id', '==', cid).limit(1).get(),
    ]);
    if (!mem.empty || !msgs.empty) continue;

    if (!DRY_RUN) await conv.ref.delete();
    deleted++;
  }
  console.log(`[ghost-conversations] deleted ${deleted}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function deleteOrphanPosts() {
  const posts = await db.collection('posts').get();
  let deleted = 0;

  for (const post of posts.docs) {
    const authorId = post.data().author_id;
    if (!authorId) {
      if (!DRY_RUN) await post.ref.delete();
      deleted++;
      continue;
    }
    const prof = await db.collection('profiles').doc(authorId).get();
    if (!prof.exists) {
      if (!DRY_RUN) await post.ref.delete();
      deleted++;
    }
  }
  console.log(`[orphan-posts] deleted ${deleted}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — writing to Firestore');
  await seedUserAuthIndex();
  await backfillConversationMembers();
  await deleteGhostConversations();
  await deleteOrphanPosts();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
