import { db } from '@/lib/firebase';
import { getDocument, setDocument, getDocuments, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { firebaseAuth } from '@/lib/firebase/authService';
import { getUserProfile, resolveProfileIdFromAuthUid } from '@/lib/firebase/users';
import type { UserProfile } from '@/lib/firebase/types';

const repaired = new Set<string>();

/** Resolve a profile id from either profiles.id or auth user_id. */
export async function normalizeToProfileId(idOrAuthUid: string): Promise<string | null> {
  if (!idOrAuthUid) return null;
  const direct = await getDocument<UserProfile>('profiles', idOrAuthUid);
  if (direct?.id) return direct.id;
  const rows = await getDocuments<UserProfile>('profiles', [
    where('user_id', '==', idOrAuthUid),
    firestoreLimit(1),
  ]);
  return rows[0]?.id ?? null;
}

/** All author_id values that belong to this profile (id + auth uid). */
export async function resolveAuthorIds(profileOrAuthId: string): Promise<string[]> {
  const profile = await getUserProfile(profileOrAuthId);
  const ids = new Set<string>([profileOrAuthId]);
  if (profile?.id) ids.add(profile.id);
  if (profile?.user_id) ids.add(profile.user_id);
  return [...ids];
}

export async function getConversationDoc<T extends Record<string, unknown>>(
  conversationId: string,
): Promise<T | null> {
  try {
    return await getDocument<T>('conversations', conversationId);
  } catch {
    return null;
  }
}

function syntheticDeterministicConversation(conversationId: string): Record<string, unknown> | null {
  const parts = conversationId.split('_').filter(Boolean);
  if (parts.length !== 2) return null;
  const member_ids = [...parts].sort();
  const now = new Date().toISOString();
  return {
    id: conversationId,
    is_group: false,
    member_ids,
    name: null,
    avatar_url: null,
    created_at: now,
    updated_at: now,
  };
}

/** Repair membership, read conversation doc, or synthesize deterministic 1:1 DM metadata. */
export async function fetchConversationForViewer(
  conversationId: string,
  profileId: string,
  otherProfileId?: string | null,
): Promise<Record<string, unknown> | null> {
  if (!conversationId || !profileId) return null;

  try {
    await ensureConversationReady(conversationId, profileId, otherProfileId);
  } catch (err) {
    console.warn('[DM] ensureConversationReady failed:', conversationId, err);
  }

  const { data, error } = await db
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (data) return data as Record<string, unknown>;

  if (error) {
    try {
      await ensureFlatConversationMembership(conversationId, profileId);
    } catch (err) {
      console.warn('[DM] membership seed failed:', conversationId, err);
    }
    const retry = await db
      .from('conversations')
      .select('*')
      .eq('id', conversationId)
      .maybeSingle();
    if (retry.data) return retry.data as Record<string, unknown>;
  }

  const synthetic = syntheticDeterministicConversation(conversationId);
  if (synthetic) return synthetic;

  const now = new Date().toISOString();
  return {
    id: conversationId,
    is_group: false,
    member_ids: [],
    name: null,
    avatar_url: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Find an existing 1:1 DM (deterministic id or legacy UUID conversation).
 */
export async function findExistingDmBetweenProfiles(
  myProfileId: string,
  otherProfileId: string,
): Promise<string | null> {
  const sorted = [myProfileId, otherProfileId].sort();
  const deterministicId = sorted.join('_');
  if (await getConversationDoc(deterministicId)) return deterministicId;

  const otherIds = await resolveAuthorIds(otherProfileId);
  const myIds = await resolveAuthorIds(myProfileId);
  const otherSet = new Set(otherIds);

  for (const viewerId of myIds) {
    const memberships = await getDocuments<Record<string, unknown>>('conversation_members', [
      where('user_id', '==', viewerId),
    ]);
    for (const m of memberships) {
      const cid = String(m.conversation_id || '');
      if (!cid) continue;
      try {
        const conv = await getConversationDoc<Record<string, unknown>>(cid);
        if (conv?.is_group) continue;

        const members = await getDocuments<Record<string, unknown>>('conversation_members', [
          where('conversation_id', '==', cid),
        ]);
        const memberIds = members.map((row) => String(row.user_id || '')).filter(Boolean);
        const hasOther = memberIds.some((mid) => otherSet.has(mid));
        const hasMe = memberIds.some((mid) => myIds.includes(mid));
        if (hasOther && hasMe && memberIds.length <= 2) return cid;
      } catch {
        // Legacy membership queries can fail when user is not yet a participant.
      }
    }
  }
  return null;
}

export async function mergeConversationMemberIds(
  conversationId: string,
  memberIds: string[],
): Promise<void> {
  try {
    await setDocument('conversations', conversationId, {
      member_ids: memberIds,
      updated_at: new Date().toISOString(),
    }, true);
  } catch (err) {
    // Non-creators cannot always patch member_ids on legacy rows — composite membership is enough.
    console.warn('[DM] member_ids merge skipped:', conversationId, err);
  }
}

const ensureReadyInflight = new Map<string, Promise<void>>();

/** Single-flight: composite membership + member_ids before chat reads. */
export async function ensureConversationReady(
  conversationId: string,
  profileId: string,
  otherProfileId?: string | null,
): Promise<void> {
  if (!conversationId || !profileId) return;
  const inflight = ensureReadyInflight.get(conversationId);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const { data: { user } } = await firebaseAuth.getUser();
      const authUid = user?.id ?? null;
      const otherProfile = otherProfileId ? await getUserProfile(otherProfileId) : null;
      const otherAuthUid = otherProfile?.user_id ?? null;

      await ensureConversationMembershipVariants(
        conversationId,
        profileId,
        otherProfileId || profileId,
        authUid,
        otherAuthUid,
      );

      const memberIds = [
        ...new Set([profileId, otherProfileId, authUid, otherAuthUid].filter(Boolean)),
      ] as string[];
      await mergeConversationMemberIds(conversationId, memberIds);
    } catch (err) {
      console.warn('[DM] ensureConversationReady partial failure:', conversationId, err);
    }
  })();

  ensureReadyInflight.set(conversationId, promise);
  try {
    await promise;
  } finally {
    ensureReadyInflight.delete(conversationId);
  }
}

/** Ensure flat membership docs exist for both participants (profile id + auth uid variants). */
export async function ensureDmMembershipPair(
  conversationId: string,
  profileIdA: string,
  profileIdB: string,
): Promise<void> {
  await ensureConversationMembershipVariants(conversationId, profileIdA, profileIdB);
}

export async function ensureConversationMembershipVariants(
  conversationId: string,
  profileIdA: string,
  profileIdB: string,
  authUidA?: string | null,
  authUidB?: string | null,
): Promise<void> {
  const ids = [...new Set([profileIdA, profileIdB, authUidA, authUidB].filter(Boolean))] as string[];
  await Promise.all(ids.map((id) => ensureFlatConversationMembership(conversationId, id)));
}

/**
 * Migrated Supabase rows use random conversation_members doc ids.
 * Firestore message rules expect `${conversationId}_${profileId}` — create if missing.
 */
export async function ensureFlatConversationMembership(
  conversationId: string,
  profileId: string,
): Promise<void> {
  if (!conversationId || !profileId) return;
  const cacheKey = `${conversationId}:${profileId}`;
  if (repaired.has(cacheKey)) return;

  const { data: { user } } = await firebaseAuth.getUser();
  const authUid = user?.id ?? null;
  const ids = [...new Set([profileId, authUid].filter(Boolean))] as string[];

  for (const memberId of ids) {
    const compositeId = `${conversationId}_${memberId}`;
    const existing = await getDocument('conversation_members', compositeId);
    if (existing) continue;

    let legacy: Record<string, unknown> | undefined;
    try {
      const legacyRows = await getDocuments<Record<string, unknown>>('conversation_members', [
        where('conversation_id', '==', conversationId),
        where('user_id', '==', memberId),
        firestoreLimit(1),
      ]);
      legacy = legacyRows[0];
    } catch {
      // Query may fail when checking another user's legacy membership rows.
    }
    const now = new Date().toISOString();

    try {
      await setDocument('conversation_members', compositeId, {
        id: compositeId,
        conversation_id: conversationId,
        user_id: memberId,
        role: (legacy?.role as string) || 'member',
        is_muted: Boolean(legacy?.is_muted),
        is_pinned: Boolean(legacy?.is_pinned),
        last_read_at: (legacy?.last_read_at as string | null) ?? null,
        created_at: (legacy?.created_at as string) || now,
        updated_at: now,
      });
    } catch (err) {
      console.warn('[DM] membership seed skipped:', compositeId, err);
    }
  }

  repaired.add(cacheKey);
}

export async function resolveDmActorIds(liveProfileId?: string | null): Promise<{
  profileId: string | null;
  authUid: string | null;
}> {
  const { data: { user } } = await firebaseAuth.getUser();
  const authUid = user?.id ?? null;
  const profileId =
    liveProfileId ??
    (authUid ? (await resolveProfileIdFromAuthUid(authUid)) || authUid : null);
  return { profileId, authUid };
}

/** Lookup profiles when member user_id may be profile id OR auth uid. */
export async function fetchMemberProfiles(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return new Map<string, Record<string, unknown>>();

  const profileByKey = new Map<string, Record<string, unknown>>();

  const { data: byId } = await db
    .from('profiles')
    .select('id, user_id, username, avatar_url, display_name, equipped_profile_theme')
    .in('id', unique);
  for (const row of byId || []) {
    profileByKey.set(row.id, row);
    if (row.user_id) profileByKey.set(row.user_id, row);
  }

  const missing = unique.filter((id) => !profileByKey.has(id));
  if (missing.length) {
    const { data: byUserId } = await db
      .from('profiles')
      .select('id, user_id, username, avatar_url, display_name, equipped_profile_theme')
      .in('user_id', missing);
    for (const row of byUserId || []) {
      profileByKey.set(row.id, row);
      if (row.user_id) profileByKey.set(row.user_id, row);
    }
  }

  return profileByKey;
}
