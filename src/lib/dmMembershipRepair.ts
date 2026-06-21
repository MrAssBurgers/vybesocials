import { db } from '@/lib/firebase';
import {
  getDocument,
  getDocumentFromServer,
  setDocument,
  getDocuments,
  where,
  firestoreLimit,
} from '@/lib/firebase/firestoreDb';
import { firebaseAuth } from '@/lib/firebase/authService';
import { getUserProfile, resolveProfileIdFromAuthUid } from '@/lib/firebase/users';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import type { UserProfile } from '@/lib/firebase/types';

const repaired = new Set<string>();
/** Conversations verified ready for message read/send this session (skip repair loops). */
const messagesReady = new Set<string>();

export function resetMessagesReady(conversationId: string, profileId: string): void {
  messagesReady.delete(`${conversationId}:${profileId}`);
}

export function isConversationMessagesReady(
  conversationId: string,
  profileId: string,
): boolean {
  return messagesReady.has(`${conversationId}:${profileId}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse the other profile id from deterministic 1:1 ids (`uuidA_uuidB`). */
export function inferOtherParticipantId(
  conversationId: string,
  myProfileId: string,
): string | null {
  const parts = conversationId.split('_').filter(Boolean);
  if (parts.length !== 2) return null;
  const [a, b] = parts;
  if (a === myProfileId) return b;
  if (b === myProfileId) return a;
  return null;
}

export function resetRepairedMembership(conversationId: string, profileId: string): void {
  repaired.delete(`${conversationId}:${profileId}`);
}

async function hasCompositeMembership(
  conversationId: string,
  memberId: string,
  fromServer = false,
): Promise<boolean> {
  const compositeId = `${conversationId}_${memberId}`;
  if (fromServer) {
    const existing = await getDocumentFromServer('conversation_members', compositeId).catch(
      () => null,
    );
    return !!existing;
  }
  const existing = await getDocument('conversation_members', compositeId);
  return !!existing;
}

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

export function syntheticDeterministicConversation(conversationId: string): Record<string, unknown> | null {
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

/** Instant ChatView shell when list cache missed — never block the UI on network. */
export function buildConversationPlaceholder(
  conversationId: string,
  viewerProfileId?: string | null,
): Record<string, unknown> {
  const meta =
    syntheticDeterministicConversation(conversationId) ?? {
      id: conversationId,
      is_group: false,
      member_ids: [] as string[],
      name: null,
      avatar_url: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

  const memberIds = [...((meta.member_ids as string[]) || [])].filter(Boolean);
  if (viewerProfileId && !memberIds.includes(viewerProfileId)) {
    memberIds.push(viewerProfileId);
  }

  const members = memberIds.map((user_id) => ({
    conversation_id: conversationId,
    user_id,
    role: 'member',
    is_muted: false,
    is_pinned: false,
    last_read_at: null,
    profile: null,
  }));

  return {
    ...meta,
    members,
    last_message: null,
    unread_count: 0,
    _sortTime: meta.updated_at,
    _hasUnread: false,
  };
}

/** List load: read conversation doc only — no membership writes (fast). */
export async function fetchConversationMetaForList(
  conversationId: string,
): Promise<Record<string, unknown> | null> {
  if (!conversationId) return null;
  const doc = await getConversationDoc<Record<string, unknown>>(conversationId);
  if (doc) return doc;
  return syntheticDeterministicConversation(conversationId);
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

/** Create missing conversation doc so Firestore rules can verify membership on send. */
export async function ensureConversationDocument(
  conversationId: string,
  profileId: string,
  otherProfileId?: string | null,
): Promise<void> {
  if (!conversationId || !profileId) return;

  const otherId =
    otherProfileId ||
    inferOtherParticipantId(conversationId, profileId) ||
    null;

  const existing = await getConversationDoc<Record<string, unknown>>(conversationId);
  if (existing) {
    const memberIds = (existing.member_ids as string[]) || [];
    const merged = [
      ...new Set([...memberIds, profileId, otherId].filter(Boolean)),
    ] as string[];
    if (merged.length > memberIds.length) {
      await mergeConversationMemberIds(conversationId, merged);
    }
    return;
  }

  const synthetic = syntheticDeterministicConversation(conversationId);
  const { data: { user } } = await firebaseAuth.getUser();
  const authUid = user?.id ?? null;

  let memberIds: string[];
  if (synthetic) {
    memberIds = [
      ...new Set([...(synthetic.member_ids as string[]), profileId, otherId, authUid].filter(Boolean)),
    ] as string[];
  } else if (otherId) {
    memberIds = [...new Set([profileId, otherId, authUid].filter(Boolean))] as string[];
  } else {
    try {
      const rows = await getDocuments<Record<string, unknown>>('conversation_members', [
        where('conversation_id', '==', conversationId),
        firestoreLimit(10),
      ]);
      const fromRows = rows.map((r) => String(r.user_id || '')).filter(Boolean);
      memberIds = [...new Set([profileId, authUid, ...fromRows].filter(Boolean))] as string[];
    } catch {
      memberIds = [...new Set([profileId, authUid].filter(Boolean))] as string[];
    }
  }

  const now = new Date().toISOString();
  try {
    await setDocument('conversations', conversationId, {
      id: conversationId,
      is_group: synthetic ? false : memberIds.length > 2,
      member_ids: memberIds,
      name: null,
      avatar_url: null,
      created_by: profileId,
      created_at: now,
      updated_at: now,
    });
  } catch (err) {
    console.warn('[DM] ensureConversationDocument skipped:', conversationId, err);
  }
}

/** Full repair before message insert — doc + membership + auth index. */
export async function repairConversationForSend(
  conversationId: string,
  profileId: string,
  otherProfileId?: string | null,
  options?: { force?: boolean },
): Promise<void> {
  if (!conversationId || !profileId) return;
  const readyKey = `${conversationId}:${profileId}`;
  if (!options?.force && messagesReady.has(readyKey)) return;

  const otherId =
    otherProfileId ||
    inferOtherParticipantId(conversationId, profileId) ||
    null;

  const { data: { user } } = await firebaseAuth.getUser();
  if (user?.id) {
    await syncUserAuthIndex(user.id, profileId);
  }

  await ensureConversationDocument(conversationId, profileId, otherId);
  await prepareConversationForMessages(conversationId, profileId, otherId, { fast: true });

  if (!messagesReady.has(readyKey)) {
    resetMessagesReady(conversationId, profileId);
    resetRepairedMembership(conversationId, profileId);
    await prepareConversationForMessages(conversationId, profileId, otherId, { fast: false });
  }
}

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
      await ensureConversationDocument(conversationId, profileId, otherProfileId);

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
  await Promise.all([
    ensureFlatConversationMembership(conversationId, profileIdA, authUidA),
    ensureFlatConversationMembership(conversationId, profileIdB, authUidB),
  ]);
}

/**
 * Migrated Supabase rows use random conversation_members doc ids.
 * Firestore message rules expect `${conversationId}_${profileId}` — create if missing.
 */
export async function ensureFlatConversationMembership(
  conversationId: string,
  memberId: string,
  memberAuthUid?: string | null,
): Promise<void> {
  if (!conversationId || !memberId) return;
  const cacheKey = `${conversationId}:${memberId}`;
  if (repaired.has(cacheKey)) return;

  const { data: { user } } = await firebaseAuth.getUser();
  const currentAuthUid = user?.id ?? null;
  const currentProfileId = user?.id
    ? (await resolveProfileIdFromAuthUid(user.id)) || user.id
    : null;
  const isSelfMember =
    memberId === currentAuthUid ||
    memberId === currentProfileId ||
    memberAuthUid === currentAuthUid;

  const authUidForMember =
    memberAuthUid ??
    (isSelfMember ? currentAuthUid : null);

  const ids = [...new Set([memberId, authUidForMember].filter(Boolean))] as string[];

  let seededAny = false;

  for (const memberId of ids) {
    const compositeId = `${conversationId}_${memberId}`;
    const existing = await getDocument('conversation_members', compositeId);
    if (existing) {
      seededAny = true;
      continue;
    }

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
      seededAny = true;
    } catch (err) {
      console.warn('[DM] membership seed skipped:', compositeId, err);
    }
  }

  const verified =
    seededAny &&
    (await Promise.all(ids.map((id) => hasCompositeMembership(conversationId, id, true)))).some(
      Boolean,
    );
  if (verified || (await hasCompositeMembership(conversationId, memberId, true))) {
    repaired.add(cacheKey);
  }
}

/** Repair + verify composite membership before message reads (retries transient rule lag). */
export async function prepareConversationForMessages(
  conversationId: string,
  profileId: string,
  otherProfileId?: string | null,
  options?: { fast?: boolean },
): Promise<void> {
  if (!conversationId || !profileId) return;
  const readyKey = `${conversationId}:${profileId}`;
  if (messagesReady.has(readyKey)) return;

  const otherId =
    otherProfileId ||
    inferOtherParticipantId(conversationId, profileId) ||
    null;

  const maxAttempts = options?.fast ? 1 : 4;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (!options?.fast) resetRepairedMembership(conversationId, profileId);
    await ensureConversationReady(conversationId, profileId, otherId);

    const { data: { user } } = await firebaseAuth.getUser();
    const authUid = user?.id ?? null;
    const ids = [...new Set([profileId, authUid].filter(Boolean))] as string[];
    const ready = await Promise.all(
      ids.map((id) => hasCompositeMembership(conversationId, id, true)),
    );
    if (ready.some(Boolean)) {
      messagesReady.add(readyKey);
      return;
    }

    if (attempt < maxAttempts - 1) await sleep(150 * (attempt + 1));
  }
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
  const selectFields =
    'id, user_id, username, avatar_url, display_name, equipped_profile_theme';

  const { data: byId } = await db.from('profiles').select(selectFields).in('id', unique);
  for (const row of byId || []) {
    profileByKey.set(String(row.id), row);
    if (row.user_id) profileByKey.set(String(row.user_id), row);
  }

  let missing = unique.filter((id) => !profileByKey.has(id));
  if (missing.length) {
    const { data: byUserId } = await db
      .from('profiles')
      .select(selectFields)
      .in('user_id', missing);
    for (const row of byUserId || []) {
      profileByKey.set(String(row.id), row);
      if (row.user_id) profileByKey.set(String(row.user_id), row);
    }
  }

  missing = unique.filter((id) => !profileByKey.has(id));
  if (missing.length) {
    await Promise.all(
      missing.map(async (id) => {
        const doc = await getDocument<Record<string, unknown>>('profiles', id);
        if (!doc?.id) return;
        profileByKey.set(String(doc.id), doc);
        if (doc.user_id) profileByKey.set(String(doc.user_id), doc);
      }),
    );
  }

  return profileByKey;
}
