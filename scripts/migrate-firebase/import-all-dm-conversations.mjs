#!/usr/bin/env node
/**
 * Backfill DM visibility for every user who ever had a conversation:
 * - Discover all conversation ids from conversations, messages, conversation_members
 * - Infer all participants (members, senders, member_ids, deterministic 1:1 ids)
 * - Seed composite conversation_members for profile id + auth uid variants
 * - Ensure conversation docs exist with merged member_ids + updated_at
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/import-all-dm-conversations.mjs [--dry-run]
 */
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from './_adminInit.mjs';

initFirebaseAdmin();
const db = getFirestore();
const DRY_RUN = process.argv.includes('--dry-run');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function stripConvSuffix(conversationId) {
  return String(conversationId).replace(/_(new|orphan\d*)$/i, '');
}

function toIso(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (typeof value?.seconds === 'number') return new Date(value.seconds * 1000).toISOString();
  return null;
}

async function loadProfileMaps() {
  const profileToAuth = new Map();
  const authToProfile = new Map();

  const [profiles, index] = await Promise.all([
    db.collection('profiles').get(),
    db.collection('user_auth_index').get(),
  ]);

  for (const doc of profiles.docs) {
    const data = doc.data();
    const profileId = doc.id;
    const authUid = data.user_id || null;
    if (authUid) {
      profileToAuth.set(profileId, authUid);
      if (!authToProfile.has(authUid)) authToProfile.set(authUid, profileId);
    }
  }

  for (const doc of index.docs) {
    const authUid = doc.id;
    const profileId = String(doc.data()?.profile_id || '');
    if (!profileId) continue;
    profileToAuth.set(profileId, authUid);
    authToProfile.set(authUid, profileId);
  }

  return { profileToAuth, authToProfile };
}

function resolveIdentity(rawId, maps) {
  if (!rawId) return { profileId: null, authUid: null, membershipIds: [] };
  const { profileToAuth, authToProfile } = maps;

  let profileId = rawId;
  let authUid = profileToAuth.get(rawId) || null;

  if (!authUid && authToProfile.has(rawId)) {
    authUid = rawId;
    profileId = authToProfile.get(rawId);
  }

  const membershipIds = [...new Set([profileId, authUid].filter(Boolean))];
  return { profileId, authUid, membershipIds };
}

function inferDeterministicParticipants(conversationId) {
  const base = stripConvSuffix(conversationId);
  return base.split('_').filter((part) => UUID_RE.test(part));
}

function collectParticipants(conversationId, convData, memberRows, senderIds, maps) {
  const raw = new Set(senderIds);
  for (const row of memberRows) {
    if (row.user_id) raw.add(String(row.user_id));
  }
  if (Array.isArray(convData?.member_ids)) {
    convData.member_ids.forEach((id) => raw.add(String(id)));
  }
  if (!convData?.is_group) {
    inferDeterministicParticipants(conversationId).forEach((id) => raw.add(id));
  }

  const membershipIds = new Set();
  const profileIds = new Set();
  for (const id of raw) {
    const resolved = resolveIdentity(id, maps);
    if (resolved.profileId) profileIds.add(resolved.profileId);
    resolved.membershipIds.forEach((mid) => membershipIds.add(mid));
  }

  return {
    membershipIds: [...membershipIds],
    profileIds: [...profileIds],
  };
}

function pickLegacyRow(memberRows, memberId) {
  return memberRows.find((row) => String(row.user_id) === String(memberId)) || null;
}

async function commitBatch(batch, pending) {
  if (DRY_RUN || pending === 0) return 0;
  await batch.commit();
  return pending;
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN — no writes' : 'LIVE — importing DM conversations');

  const maps = await loadProfileMaps();
  const [convSnap, memberSnap, msgSnap] = await Promise.all([
    db.collection('conversations').get(),
    db.collection('conversation_members').get(),
    db.collection('messages').select('conversation_id', 'sender_id', 'created_at').get(),
  ]);

  const convById = new Map(convSnap.docs.map((d) => [d.id, d.data()]));
  const membersByConv = new Map();
  for (const doc of memberSnap.docs) {
    const row = { id: doc.id, ...doc.data() };
    const cid = String(row.conversation_id || '');
    if (!cid) continue;
    if (!membersByConv.has(cid)) membersByConv.set(cid, []);
    membersByConv.get(cid).push(row);
  }

  const sendersByConv = new Map();
  const latestMessageAt = new Map();
  for (const doc of msgSnap.docs) {
    const { conversation_id, sender_id, created_at } = doc.data();
    if (!conversation_id) continue;
    const cid = String(conversation_id);
    if (sender_id) {
      if (!sendersByConv.has(cid)) sendersByConv.set(cid, new Set());
      sendersByConv.get(cid).add(String(sender_id));
    }
    const iso = toIso(created_at);
    if (iso) {
      const prev = latestMessageAt.get(cid);
      if (!prev || iso > prev) latestMessageAt.set(cid, iso);
    }
  }

  const conversationIds = new Set([
    ...convById.keys(),
    ...membersByConv.keys(),
    ...sendersByConv.keys(),
  ]);

  let membershipCreated = 0;
  let membershipUpdated = 0;
  let conversationsCreated = 0;
  let conversationsUpdated = 0;

  let batch = db.batch();
  let batchOps = 0;

  const flush = async () => {
    if (batchOps > 0) {
      await commitBatch(batch, batchOps);
      batch = db.batch();
      batchOps = 0;
    }
  };

  const queueSet = (ref, data) => {
    if (DRY_RUN) return;
    batch.set(ref, data, { merge: true });
    batchOps++;
    if (batchOps >= 400) return flush();
  };

  for (const conversationId of conversationIds) {
    const convData = convById.get(conversationId) || {};
    const memberRows = membersByConv.get(conversationId) || [];
    const senderIds = [...(sendersByConv.get(conversationId) || [])];
    const hasMessages = senderIds.length > 0 || latestMessageAt.has(conversationId);
    const hasMembers = memberRows.length > 0;

    if (!hasMessages && !hasMembers && !convById.has(conversationId)) continue;

    const { membershipIds, profileIds } = collectParticipants(
      conversationId,
      convData,
      memberRows,
      senderIds,
      maps,
    );

    if (!membershipIds.length && !profileIds.length) continue;

    const mergedMemberIds = [...new Set([
      ...(Array.isArray(convData.member_ids) ? convData.member_ids.map(String) : []),
      ...membershipIds,
      ...profileIds,
    ])].filter(Boolean);

    const now = new Date().toISOString();
    const updatedAt = latestMessageAt.get(conversationId) || toIso(convData.updated_at) || now;
    const isGroup = Boolean(convData.is_group);
    const deterministicParts = !isGroup ? inferDeterministicParticipants(conversationId) : [];

    const convRef = db.collection('conversations').doc(conversationId);
    if (!convById.has(conversationId)) {
      conversationsCreated++;
      queueSet(convRef, {
        id: conversationId,
        is_group: isGroup || deterministicParts.length > 2,
        name: convData.name ?? null,
        avatar_url: convData.avatar_url ?? null,
        created_by: convData.created_by || profileIds[0] || membershipIds[0] || null,
        member_ids: mergedMemberIds,
        created_at: toIso(convData.created_at) || now,
        updated_at: updatedAt,
      });
    } else {
      conversationsUpdated++;
      queueSet(convRef, {
        member_ids: mergedMemberIds,
        updated_at: updatedAt,
      });
    }

    for (const memberId of membershipIds) {
      const compositeId = `${conversationId}_${memberId}`;
      const ref = db.collection('conversation_members').doc(compositeId);
      const legacy = pickLegacyRow(memberRows, memberId);
      const existing = memberRows.find((row) => row.id === compositeId);

      const payload = {
        id: compositeId,
        conversation_id: conversationId,
        user_id: memberId,
        role: (legacy?.role || existing?.role || 'member'),
        is_muted: Boolean(legacy?.is_muted ?? existing?.is_muted),
        is_pinned: Boolean(legacy?.is_pinned ?? existing?.is_pinned),
        last_read_at: legacy?.last_read_at ?? existing?.last_read_at ?? null,
        updated_at: now,
        created_at: toIso(legacy?.created_at || existing?.created_at) || now,
      };

      if (existing || legacy) {
        membershipUpdated++;
      } else {
        membershipCreated++;
      }
      queueSet(ref, payload);
    }
  }

  await flush();

  const usersWithMessages = new Set();
  for (const senders of sendersByConv.values()) {
    senders.forEach((id) => usersWithMessages.add(id));
  }

  let usersMissingVisibleMembership = 0;
  for (const rawUserId of usersWithMessages) {
    const { membershipIds } = resolveIdentity(rawUserId, maps);
    let visible = false;
    for (const memberId of membershipIds) {
      const snap = await db.collection('conversation_members').where('user_id', '==', memberId).limit(1).get();
      if (!snap.empty) {
        visible = true;
        break;
      }
    }
    if (!visible) usersMissingVisibleMembership++;
  }

  console.log('\n[import-all-dm-conversations]');
  console.log('  conversations discovered:', conversationIds.size);
  console.log('  conversation docs created:', conversationsCreated);
  console.log('  conversation docs updated:', conversationsUpdated);
  console.log('  membership rows created:', membershipCreated);
  console.log('  membership rows updated:', membershipUpdated);
  console.log('  users with messages still missing membership:', usersMissingVisibleMembership);
  console.log(DRY_RUN ? '\nDry run complete — re-run without --dry-run to apply.' : '\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
