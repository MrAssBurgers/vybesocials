import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import type { Conversation, Message } from '@/hooks/useMessages';
import { isPermissionDeniedError, warnOnce } from '@/lib/logOnce';
import { reportAppCrash } from '@/lib/bugReportClient';
import { normalizeDmConversationList, safeDmMembers, reviveQueriesInCache } from '@/lib/persistedCollections';
import { purgeStuckStoryUploads } from '@/lib/storiesCacheSanitize';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { withTimeout } from '@/lib/withTimeout';
import { fetchMemberProfiles, fetchConversationMetaForList, syntheticDeterministicConversation, normalizeToProfileId } from '@/lib/dmMembershipRepair';
import { listUserChats } from '@/lib/firebase/chats';
import {
  fetchLatestMessagePerConversation,
  fetchMessagesForConversations,
} from '@/lib/conversationMessagesQuery';

import {
  buildConversationMembers,
} from '@/lib/dmMemberResolve';
import { maxLastReadAt } from '@/lib/markConversationRead';
import { getDmConversationSortTime, sortDmConversations } from '@/lib/dmConversationSort';
import { reportAccountGuard, reportAccountSnapshot, isReportSessionError, type ReportAccountSession } from '@/lib/reportModerationService';
import { dmListQueryKey, isDmConversationForViewer, isOwnedDmActor, ownedDmProfileId } from '@/lib/dmAccountScope';
import { getProfileByAuthUid } from '@/lib/firebase/users';
import { setCachedProfile } from '@/lib/profileCache';

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
  session: ReportAccountSession = reportAccountSnapshot(),
): void {
  const current = reportAccountSnapshot();
  if (!session.uid || current.uid !== session.uid || current.epoch !== session.epoch) return;
  if (!isOwnedDmActor(profileId, session.uid)) return;
  const normalized = normalizeDmConversationList<LoadedDMConversation>(data)
    .filter(row => isDmConversationForViewer(row, ownedDmProfileId(session.uid) || profileId, session.uid));
  queryClient.setQueryData(dmListQueryKey(profileId, session), normalized);
  queryClient.setQueryData(['conversations', profileId, session.uid, session.epoch], normalized);
}

/** Read + normalize DM list from any warm React Query key (instant /messages paint). */
export function readDmConversationsCache(
  queryClient: QueryClient,
  profileId?: string | null,
  authUid?: string | null,
  session: ReportAccountSession = reportAccountSnapshot(),
): LoadedDMConversation[] {
  if (!authUid || authUid !== session.uid) return [];
  const current = reportAccountSnapshot();
  if (current.uid !== session.uid || current.epoch !== session.epoch) return [];
  const viewerProfileId = ownedDmProfileId(authUid) || (isOwnedDmActor(profileId, authUid) ? profileId : undefined);
  let best: LoadedDMConversation[] = [];

  const tryKey = (id: string | null | undefined) => {
    if (!id || !isOwnedDmActor(id, authUid)) return;
    const primary = normalizeDmConversationList<LoadedDMConversation>(
      queryClient.getQueryData(dmListQueryKey(id, session)),
    ).filter(row => isDmConversationForViewer(row, viewerProfileId, authUid));
    if (primary.length > best.length) best = primary;
    const legacy = normalizeDmConversationList<LoadedDMConversation>(
      queryClient.getQueryData(['conversations', id, session.uid, session.epoch]),
    ).filter(row => isDmConversationForViewer(row, viewerProfileId, authUid));
    if (legacy.length > best.length) best = legacy;
  };

  tryKey(profileId);
  tryKey(authUid);

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
  const session = reportAccountSnapshot();
  const guard = reportAccountGuard(session.uid || '');
  guard();
  const ownProfileId = ownedDmProfileId(session.uid);
  const stale = normalizeDmConversationList<LoadedDMConversation>(fallback)
    .filter(row => isDmConversationForViewer(row, ownProfileId, session.uid));

  try {
    const result = await withTimeout(
      loadDMConversationsOnce(profileId, stale, guard, session.uid!),
      35_000,
      'Loading chats timed out',
    );
    guard();
    return result;
  } catch (err) {
    guard();
    if (isReportSessionError(err)) throw err;
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

async function fetchMembershipRows(profileId: string, authUid?: string | null) {
  const ids = Array.from(
    new Set([profileId, authUid].filter((id): id is string => Boolean(id))),
  );
  const results = await Promise.all(
    ids.map(async (userId) => {
      const { data, error } = await db
        .from('conversation_members')
        .select('conversation_id, last_read_at, is_pinned, is_muted')
        .eq('user_id', userId);
      return { rows: data || [], error, userId };
    }),
  );

  const merged: Array<{ conversation_id: string; last_read_at?: string | null; is_pinned?: boolean; is_muted?: boolean }> = [];
  let firstError: { message?: string } | null = null;
  for (const result of results) {
    if (result.error && !firstError) firstError = result.error;
    for (const row of result.rows) merged.push(row);
  }
  // Only surface error when every key failed and we got no rows.
  const error = merged.length === 0 ? firstError : null;
  return { rows: merged, error };
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
  guard: () => void,
  expectedUid: string,
): Promise<LoadDMConversationsResult> {
  try {
    // OAuth custom-token race: wait briefly for auth before membership queries.
    const { waitForAuthSession } = await import('@/lib/auth');
    const sessionReady = await waitForAuthSession(2000);
    guard();
    if (!sessionReady?.user) {
      if (stale.length > 0) {
        return { data: stale, error: null, profileId };
      }
      return {
        data: [],
        error: { message: 'Auth not ready' },
        profileId,
      };
    }

    const authUid = sessionReady.user.id ?? null;
    if (authUid !== expectedUid) throw Object.assign(new Error('Your account changed.'), { code: 'account-changed' });
    const profile = await getProfileByAuthUid(authUid);
    guard();
    const effectiveProfileId = profile?.user_id === authUid ? profile.id : authUid;
    if (profile?.user_id === authUid) setCachedProfile({ ...profile, username: profile.username || '', display_name: profile.display_name || null, avatar_url: profile.avatar_url || null });

    if (authUid && effectiveProfileId) {
      await syncUserAuthIndex(authUid, effectiveProfileId);
      guard();
    }

    const [
      { rows: membershipRows, error: membershipError },
      { data: hiddenData },
      { data: trashedData },
    ] = await Promise.all([
      fetchMembershipRows(effectiveProfileId, authUid),
      db.from('hidden_conversations').select('conversation_id').eq('user_id', effectiveProfileId),
      db.from('trashed_conversations').select('conversation_id').eq('user_id', effectiveProfileId),
    ]);
    guard();

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
        return {
          data: [],
          error: { message: membershipError.message || 'Membership query failed' },
          profileId: effectiveProfileId,
        };
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
      return { data: [], error: null, profileId: effectiveProfileId };
    }

    const hiddenIds = new Set((hiddenData || []).map((h) => h.conversation_id));
    const trashedIds = new Set((trashedData || []).map((t) => t.conversation_id));

    const conversationResults = await fetchConversationsForList(userConversationIds);
    guard();
    const conversationsRaw = conversationResults.filter(row => row && (
      isDmConversationForViewer(row, effectiveProfileId, authUid)
      || (!Array.isArray(row.member_ids) && membershipMap.has(String(row.id)))
    )) as Record<string, unknown>[];
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
      { data: latestMessages, error: latestMessagesError },
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
      fetchLatestMessagePerConversation(userConversationIds),
      profileSeedIds.length ? fetchMemberProfiles(profileSeedIds) : Promise.resolve(new Map()),
    ]);
    guard();

    if (membersError) {
      console.warn('[DM] all-members query error:', membersError.message);
    }
    if (messagesError) {
      console.warn('[DM] messages query error:', messagesError.message);
    }
    if (latestMessagesError) {
      console.warn('[DM] latest message query error:', latestMessagesError.message);
    }

    const memberUserIds = Array.from(new Set((allMembers || []).map((m) => String(m.user_id))));
    const missingProfileIds = memberUserIds.filter((id) => !seededProfiles.has(id));
    const profileByKey =
      missingProfileIds.length > 0
        ? await fetchMemberProfiles([...new Set([...profileSeedIds, ...missingProfileIds])] as string[])
        : seededProfiles;
    guard();

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
    const staleById = new Map(stale.map((c) => [String(c.id), c]));

    (latestMessages || []).forEach((msg) => {
      if (msg.is_deleted || !msg.conversation_id) return;
      lastMessageMap.set(String(msg.conversation_id), msg as Message);
    });

    (allMessages || []).forEach((msg) => {
      if (msg.is_deleted) return;
      const cid = String(msg.conversation_id);
      if (!lastMessageMap.has(cid)) {
        lastMessageMap.set(cid, msg as Message);
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

    const seenConversationIds = new Set<string>();
    const result: LoadedDMConversation[] = [];

    conversationsData
      .filter((conv) => !hiddenIds.has(conv.id) && !trashedIds.has(conv.id))
      .forEach((conv) => {
        // Different conversation IDs can contain different message histories,
        // even for the same person. Names and peer IDs are display identities.
        if (seenConversationIds.has(conv.id)) return;
        seenConversationIds.add(conv.id);

        const lastMessage =
          lastMessageMap.get(String(conv.id)) ??
          staleById.get(String(conv.id))?.last_message ??
          null;
        const unreadCount = unreadCountMap.get(conv.id) || 0;

        result.push({
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount,
          _sortTime: getDmConversationSortTime({
            ...conv,
            last_message: lastMessage,
          } as LoadedDMConversation),
          _hasUnread: unreadCount > 0,
        } as LoadedDMConversation);
      });

    let sorted = sortDmConversations(result, effectiveProfileId);

    const missingLastMessageIds = sorted.filter((c) => !c.last_message).map((c) => c.id);
    if (missingLastMessageIds.length > 0) {
      const { data: backfill } = await fetchLatestMessagePerConversation<Message>(missingLastMessageIds);
      guard();
      for (const msg of backfill) {
        if (msg.is_deleted || !msg.conversation_id) continue;
        const conv = sorted.find((c) => String(c.id) === String(msg.conversation_id));
        if (conv) {
          conv.last_message = msg;
          const nextSort = getDmConversationSortTime(conv);
          if (!conv._sortTime || nextSort > conv._sortTime) {
            conv._sortTime = nextSort;
          }
        }
      }
      sorted = sortDmConversations(sorted, effectiveProfileId);
    }

    guard();
    return { data: sorted, error: null, profileId: effectiveProfileId };
  } catch (err) {
    guard();
    if (isReportSessionError(err)) throw err;
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
  const session = reportAccountSnapshot();
  const guard = reportAccountGuard(authUid || session.uid || '');
  try {
    guard();
    if (!session.uid || !isOwnedDmActor(profileId, session.uid)) return;
    const cached = readDmConversationsCache(queryClient, profileId, session.uid, session);
    const { data, error, profileId: resolvedId } = await loadDMConversations(profileId, cached);
    guard();
    if (error) return;
    syncDmListCaches(queryClient, resolvedId, data, session);
    if (resolvedId !== profileId) syncDmListCaches(queryClient, profileId, data, session);
    syncDmListCaches(queryClient, session.uid, data, session);
  } catch (error) {
    if (!isReportSessionError(error)) console.warn('[DM] prefetch unavailable');
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
  // Seed any warm list onto the active key immediately (authUid works before profileId).
  if (profileId) {
    seedDmConversationsCache(queryClient, profileId, authUid);
    void prefetchDMConversations(queryClient, profileId, authUid);
    return;
  }
  if (authUid) {
    const hit = readDmConversationsCache(queryClient, null, authUid);
    if (hit.length) {
      syncDmListCaches(queryClient, authUid, hit);
    }
  }
}

/** Best-effort prefetch using the global query client (nav hover). */
export function prefetchDMConversationsFromNav(): void {
  const queryClient = (window as any).__REACT_QUERY_CLIENT__ as QueryClient | null | undefined;
  if (!queryClient) return;

  const session = reportAccountSnapshot();
  if (!session.uid) return;
  const profileId = ownedDmProfileId(session.uid) || session.uid;
  void prefetchDMConversations(queryClient, profileId, session.uid);
}
