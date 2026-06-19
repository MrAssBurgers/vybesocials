import { db } from '@/lib/firebase';
import { getDocument, setDocument, getDocuments, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { firebaseAuth } from '@/lib/firebase/authService';
import { resolveProfileIdFromAuthUid } from '@/lib/firebase/profileResolve';

const repaired = new Set<string>();

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

    const legacyRows = await getDocuments<Record<string, unknown>>('conversation_members', [
      where('conversation_id', '==', conversationId),
      where('user_id', '==', memberId),
      firestoreLimit(1),
    ]);
    const legacy = legacyRows[0];
    const now = new Date().toISOString();

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
    .select('id, user_id, username, avatar_url, display_name')
    .in('id', unique);
  for (const row of byId || []) {
    profileByKey.set(row.id, row);
    if (row.user_id) profileByKey.set(row.user_id, row);
  }

  const missing = unique.filter((id) => !profileByKey.has(id));
  if (missing.length) {
    const { data: byUserId } = await db
      .from('profiles')
      .select('id, user_id, username, avatar_url, display_name')
      .in('user_id', missing);
    for (const row of byUserId || []) {
      profileByKey.set(row.id, row);
      if (row.user_id) profileByKey.set(row.user_id, row);
    }
  }

  return profileByKey;
}
