import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import type { Conversation, Message } from '@/hooks/useMessages';
import { isPermissionDeniedError, warnOnce } from '@/lib/logOnce';
import { reportAppCrash } from '@/lib/bugReportClient';
import { normalizeDmConversationList, safeDmMembers, reviveQueriesInCache } from '@/lib/persistedCollections';
import { purgeStuckStoryUploads } from '@/lib/storiesCacheSanitize';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { withTimeout } from '@/lib/withTimeout';
import { fetchMemberProfiles, fetchConversationMetaForList, syntheticDeterministicConversation, normalizeToProfileId } from '@/lib/dmMembershipRepair';
import { listUserChats } from '@/lib/firebase/chats';
import { fetchMessagesForConversations } from '@/lib/conversationMessagesQuery';

import {
  buildConversationMembers,
  inferOtherUserIdFromConversation,
} from '@/lib/dmMemberResolve';
import { maxLastReadAt } from '@/lib/markConversationRead';

export interface LoadedDMConversation extends Conversation {
  _sortTime: string;
  _hasUnread: boolean;
}

export interface LoadDMConversationsResult {
  data: LoadedDMConversation[];
  error: { message: string; name?: string } | null;
  profileId: string;
}

/** Write-through to legacy conversations cache key. */
export function syncDmListCaches(
  queryClient: QueryClient,
  profileId: string,
  data: LoadedDMConversation[],
): void {
  const normalized = normalizeDmConversationList<LoadedDMConversation>(data);
  queryClient.setQueryData(['dm-conversations', profileId], normalized);
  queryClient.setQueryData(['conversations', profileId], normalized);
}

/** Read + normalize DM list from any warm React Query key (instant /messages paint). */
export function readDmConversationsCache(
  queryClient: QueryClient,
  profileId?: string | null,
  authUid?: string | null,
): LoadedDMConversation[] {
  let best: LoadedDMConversation[] = [];

  const tryKey = (id: string | null | undefined) => {
    if (!id) return;
    const primary = normalizeDmConversationList<LoadedDMConversation>(
      queryClient.getQueryData(['dm-conversations', id]),
    );
    if (primary.length > best.length) best = primary;
    const legacy = normalizeDmConversationList<LoadedDMConversation>(
      queryClient.getQueryData(['conversations', id]),
    );
    if (legacy.length > best.length) best = legacy;
  };

  tryKey(profileId);
  tryKey(authUid);

  if (best.length) return best;

  for (const [, data] of queryClient.getQueriesData({ queryKey: ['dm-conversations'] })) {
    const hit = normalizeDmConversationList<LoadedDMConversation>(data);
    if (hit.length > best.length) best = hit;
  }
  return best;
}

/** Copy any warm DM list snapshot onto the active profile key. */
export function seedDmConversationsCache(
  queryClient: QueryClient,
  profileId: string,
  authUid?: string | null,
): LoadedDMConversation[] {
  const hit = readDmConversationsCache(queryClient, profileId, authUid);
  if (hit.length) syncDmListCaches(queryClient, profileId, hit);
  return hit;
}

/**
 * Fetch the DM conversation list (same shape as useDMConversations).
 * Fail-soft: returns fallback/stale data on error instead of throwing.
 */
export async function loadDMConversations(
  profileId: string,
  fallback?: LoadedDMConversation[],
): Promise<LoadDMConversationsResult> {
  const stale = fallback?.length ? fallback : [];

  try {
    const result = await withTimeout(
      loadDMConversationsOnce(profileId, stale),
      35_000,
      'Loading chats timed out',
    );
    return result;
  } catch (err) {
    console.warn('[DM] load failed:', err);
    if (stale.length > 0) {
      return { data: stale, error: null, profileId };
    }
    const error = err instanceof Error ? err : new Error(String(err));
    return { data: stale, error, profileId };
  }
}

function reportDmPermissionOnce(message: string, profileId: string) {
  warnOnce('dm-permission-denied', message);
  void reportAppCrash({
    error: message,
    source: 'dm_conversations',
    reason: 'DM permission denied',
    context: { profileId },
    mode: 'auto',
  });
}

/** Per-document fetch — Firestore list rules reject batched `id in (...)` on conversations. */
async function fetchConversationsForList(
  conversationIds: string[],
): Promise<Array<Record<string, unknown> | null>> {
  if (!conversationIds.length) return [];

  return Promise.all(
    conversationIds.map(async (id) => {
      try {
        const { data, error } = await db.from('conversations').select('*').eq('id', id).maybeSingle();
        if (data) return data as Record<string, unknown>;
        if (error && isPermissionDeniedError(error)) {
          reportDmPermissionOnce(`[DM] conversation read denied: ${id}`, id);
        } else if (error) {
          warnOnce(`dm-conv-${id}`, '[DM] conversation fetch error:', error.message);
        }
      } catch (err) {
        if (!isPermissionDeniedError(err)) {
          console.warn('[DM] conversation fetch failed:', id, err);
        }
      }
      return syntheticDeterministicConversation(id) ?? (await fetchConversationMetaForList(id));
    }),
  );
}

async function fetchMembershipRows(profileId: string) {
  const { data, error } = await db
    .from('conversation_members')
    .select('conversation_id, last_read_at, is_pinned, is_muted')
    .eq('user_id', profileId);

  return { rows: data || [], error };
}

async function discoverConversationIdsViaChats(
  profileId: string,
  authUid: string | null,
): Promise<string[]> {
  const ids = new Set<string>();
  const tryIds = new Set<string>([profileId, authUid].filter(Boolean) as string[]);
  for (const id of [...tryIds]) {
    try {
      const normalized = await normalizeToProfileId(id);
      if (normalized) tryIds.add(normalized);
    } catch {
      /* best effort */
    }
  }
  for (const id of tryIds) {
    try {
      const chats = await listUserChats(id);
      for (const chat of chats) {
        if (chat.id) ids.add(chat.id);
      }
    } catch (err) {
      console.warn('[DM] listUserChats fallback failed:', id, err);
    }
  }
  return [...ids];
}

async function loadDMConversationsOnce(
  profileId: string,
  stale: LoadedDMConversation[],
): Promise<LoadDMConversationsResult> {
  try {
    const effectiveProfileId =
      syncSessionProfileId(profileId) ??
      (await resolveSessionProfileId(profileId)) ??
      profileId;
    const { data: { session } } = await db.auth.getSession();
    const authUid = session?.user?.id ?? null;

    if (authUid && effectiveProfileId) {
      await syncUserAuthIndex(authUid, effectiveProfileId);
    }

    const [
      { rows: membershipRows, error: membershipError },
      { data: hiddenData },
      { data: trashedData },
    ] = await Promise.all([
      fetchMembershipRows(effectiveProfileId),
      db.from('hidden_conversations').select('conversation_id').eq('user_id', effectiveProfileId),
      db.from('trashed_conversations').select('conversation_id').eq('user_id', effectiveProfileId),
    ]);

    const membershipMap = new Map<string, { last_read_at?: string | null; conversation_id: string }>();

    if (membershipError) {
      if (isPermissionDeniedError(membershipError)) {
        reportDmPermissionOnce(`[DM] membership query denied for ${effectiveProfileId}`, effectiveProfileId);
      } else {
        console.warn('[DM] membership query error:', membershipError.message);
      }
      if (stale.length > 0) {
        return { data: stale, error: null, profileId: effectiveProfileId };
      }
      const discovered = await discoverConversationIdsViaChats(effectiveProfileId, authUid);
      for (const id of discovered) {
        membershipMap.set(id, { conversation_id: id, last_read_at: null });
      }
      if (!membershipMap.size) {
        return { data: [], error: membershipError, profileId: effectiveProfileId };
      }
    }

    for (const row of membershipRows) {
      const cid = String(row.conversation_id);
      const existing = membershipMap.get(cid);
      if (!existing) {
        membershipMap.set(cid, row);
        continue;
      }
      const best = maxLastReadAt([existing, row]);
      membershipMap.set(cid, {
        ...row,
        last_read_at: best,
      });
    }
    let userConversationIds = [...membershipMap.keys()];

    if (!userConversationIds.length) {
      const discovered = await discoverConversationIdsViaChats(effectiveProfileId, authUid);
      for (const id of discovered) {
        membershipMap.set(id, { conversation_id: id, last_read_at: null });
      }
      userConversationIds = [...membershipMap.keys()];
    }

    if (!userConversationIds.length) {
      if (stale.length > 0) {
        userConversationIds = stale.map((c) => c.id).filter(Boolean);
      }
      if (!userConversationIds.length) {
        return { data: [], error: null, profileId: effectiveProfileId };
      }
    }

    const hiddenIds = new Set((hiddenData || []).map((h) => h.conversation_id));
    const trashedIds = new Set((trashedData || []).map((t) => t.conversation_id));

    const conversationResults = await fetchConversationsForList(userConversationIds);
    const conversationsRaw = conversationResults.filter(Boolean) as Record<string, unknown>[];
    conversationsRaw.sort(
      (a, b) =>
        new Date(String(b.updated_at || 0)).getTime() -
        new Date(String(a.updated_at || 0)).getTime(),
    );
    if (!conversationsRaw.length) {
      return { data: [], error: null, profileId: effectiveProfileId };
    }

    const fallbackMemberIds = conversationsRaw.flatMap((c) =>
      ((c.member_ids as string[]) || []).map(String),
    );
    const profileSeedIds = [...new Set(fallbackMemberIds)] as string[];

    const [
      { data: allMembers, error: membersError },
      { data: allMessages, error: messagesError },
      seededProfiles,
    ] = await Promise.all([
      db
        .from('conversation_members')
        .select('conversation_id, user_id, role, is_muted, is_pinned, last_read_at')
        .in('conversation_id', userConversationIds),
      fetchMessagesForConversations(
        userConversationIds,
        'id, conversation_id, sender_id, content, media_type, viewed_at, created_at, is_deleted',
        Math.min(Math.max(userConversationIds.length * 3, 60), 250),
      ),
      profileSeedIds.length ? fetchMemberProfiles(profileSeedIds) : Promise.resolve(new Map()),
    ]);

    if (membersError) {
      console.warn('[DM] all-members query error:', membersError.message);
    }
    if (messagesError) {
      console.warn('[DM] messages query error:', messagesError.message);
    }

    const memberUserIds = Array.from(new Set((allMembers || []).map((m) => String(m.user_id))));
    const missingProfileIds = memberUserIds.filter((id) => !seededProfiles.has(id));
    const profileByKey =
      missingProfileIds.length > 0
        ? await fetchMemberProfiles([...new Set([...profileSeedIds, ...missingProfileIds])] as string[])
        : seededProfiles;

    const membersByConv = new Map<string, any[]>();
    (allMembers || []).forEach((m) => {
      const arr = membersByConv.get(String(m.conversation_id)) || [];
      arr.push({ ...m, profile: profileByKey.get(String(m.user_id)) || null });
      membersByConv.set(String(m.conversation_id), arr);
    });

    const conversationsData: any[] = conversationsRaw.map((c) => {
      const cid = String((c as any).id);
      const existing = membersByConv.get(cid) || [];
      const memberIds = Array.isArray((c as any).member_ids)
        ? ((c as any).member_ids as string[])
        : undefined;
      const members = buildConversationMembers(
        cid,
        existing,
        memberIds,
        profileByKey,
        effectiveProfileId,
        authUid,
      );
      return { ...(c as any), members };
    });

    const lastMessageMap = new Map<string, Message>();
    const unreadCountMap = new Map<string, number>();

    (allMessages || []).forEach((msg) => {
      if (msg.is_deleted) return;
      if (!lastMessageMap.has(msg.conversation_id)) {
        lastMessageMap.set(msg.conversation_id, msg as Message);
      }
      const membership = membershipMap.get(msg.conversation_id);
      const lastReadAt = membership?.last_read_at || '1970-01-01';
      if (
        (msg as any).sender_id !== effectiveProfileId &&
        (msg as any).sender_id !== authUid &&

        msg.created_at > lastReadAt
      ) {
        unreadCountMap.set(
          msg.conversation_id,
          (unreadCountMap.get(msg.conversation_id) || 0) + 1,
        );
      }
    });

    const seenOtherUserIds = new Set<string>();
    const result: LoadedDMConversation[] = [];

    conversationsData
      .filter((conv) => !hiddenIds.has(conv.id) && !trashedIds.has(conv.id))
      .forEach((conv) => {
        if (!conv.is_group) {
          const otherRawId = inferOtherUserIdFromConversation(
            conv,
            effectiveProfileId,
            authUid,
          );
          const otherProfile = otherRawId ? profileByKey.get(otherRawId) : null;
          const dedupeKey = otherProfile?.id
            ? String(otherProfile.id)
            : otherRawId || conv.id;
          if (dedupeKey) {
            if (seenOtherUserIds.has(dedupeKey)) return;
            seenOtherUserIds.add(dedupeKey);
          }
        }

        const lastMessage = lastMessageMap.get(conv.id) || null;
        const unreadCount = unreadCountMap.get(conv.id) || 0;

        result.push({
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount,
          _sortTime: lastMessage?.created_at || conv.updated_at,
          _hasUnread: unreadCount > 0,
        } as LoadedDMConversation);
      });

    result.sort((a, b) => {
      const aIsPinned = safeDmMembers(a.members).find((m) => m.user_id === effectiveProfileId)?.is_pinned;
      const bIsPinned = safeDmMembers(b.members).find((m) => m.user_id === effectiveProfileId)?.is_pinned;
      if (aIsPinned && !bIsPinned) return -1;
      if (!aIsPinned && bIsPinned) return 1;
      if (aIsPinned && bIsPinned) {
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      }
      if (a._hasUnread && !b._hasUnread) return -1;
      if (!a._hasUnread && b._hasUnread) return 1;
      return new Date(b._sortTime).getTime() - new Date(a._sortTime).getTime();
    });

    return { data: result, error: null, profileId: effectiveProfileId };
  } catch (err) {
    console.warn('[DM] load failed:', err);
    if (stale.length > 0) {
      return { data: stale, error: null, profileId };
    }
    const error = err instanceof Error ? err : new Error(String(err));
    return { data: stale, error, profileId };
  }
}

/** Warm the React Query cache if DMs are not already loaded. */
export async function prefetchDMConversations(
  queryClient: QueryClient,
  profileId: string,
  authUid?: string | null,
): Promise<void> {
  const cached = readDmConversationsCache(queryClient, profileId, authUid);
  if (cached.length > 0) {
    syncDmListCaches(queryClient, profileId, cached);
    void loadDMConversations(profileId, cached).then(({ data, profileId: resolvedId }) => {
      if (data.length > 0) {
        syncDmListCaches(queryClient, resolvedId, data);
        if (resolvedId !== profileId) syncDmListCaches(queryClient, profileId, data);
      }
    });
    return;
  }

  const { data, profileId: resolvedId } = await loadDMConversations(profileId, cached);
  if (data.length > 0) {
    syncDmListCaches(queryClient, resolvedId, data);
    if (resolvedId !== profileId) syncDmListCaches(queryClient, profileId, data);
  }
}

/** Sanitize cache + seed DM list before /messages paints. */
export function prepareMessagesRoute(
  queryClient: QueryClient,
  profileId?: string | null,
  authUid?: string | null,
): void {
  reviveQueriesInCache(queryClient);
  purgeStuckStoryUploads(queryClient, profileId);
  if (profileId) {
    seedDmConversationsCache(queryClient, profileId, authUid);
    void prefetchDMConversations(queryClient, profileId, authUid);
  }
}

/** Best-effort prefetch using the global query client (nav hover). */
export function prefetchDMConversationsFromNav(): void {
  const queryClient = (window as any).__REACT_QUERY_CLIENT__ as QueryClient | null | undefined;
  if (!queryClient) return;

  const entries = queryClient.getQueriesData<LoadedDMConversation[]>({
    queryKey: ['dm-conversations'],
  });
  for (const [key, data] of entries) {
    const profileId = key[1] as string | undefined;
    if (!profileId) continue;
    if (Array.isArray(data) && data.length > 0) return;
    void prefetchDMConversations(queryClient, profileId);
    return;
  }

  void (async () => {
    const resolved = await resolveSessionProfileId();
    if (resolved) {
      void prefetchDMConversations(queryClient, resolved);
    }
  })();
}
