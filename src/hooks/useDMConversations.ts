import { useEffect, useMemo, useCallback, useRef } from 'react';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';
// Track which friend ids we've already tried to create a DM for in this session.
// Using a module-level set (instead of a ref) means a transient failure can be
// retried on the next render cycle without being permanently locked out.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useFriends } from '@/hooks/useFriends';
import {
  loadDMConversations,
  readDmConversationsCache,
  syncDmListCaches,
  type LoadedDMConversation,
} from '@/lib/loadDMConversations';
import { refetchListOnMount } from '@/lib/queryRefetchPolicy';
import { shouldRetryQuery } from '@/lib/logOnce';
import { markConversationReadForViewer, getSessionAuthUid } from '@/lib/markConversationRead';
import { ensureArray, normalizeDmConversation, normalizeDmConversationList, safeDmMembers, readQueryArray } from '@/lib/persistedCollections';
import { readMessagesCache } from '@/lib/messagesQueryKey';
import {
  fetchMemberProfiles,
  ensureConversationReady,
  fetchConversationForViewer,
  inferOtherParticipantId,
} from '@/lib/dmMembershipRepair';
import { createDmChat } from '@/lib/firebase/chats';
import { warmDmConversationBatch } from '@/lib/warmDmConversation';
import { getDmConversationSortTime } from '@/lib/dmConversationSort';
import { resolveOtherMemberFromConversation, isViewerMember } from '@/lib/dmMemberResolve';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard, type ReportAccountSession } from '@/lib/reportModerationService';
import { conversationDetailQueryKey, dmListQueryKey, ownedDmProfileId, isOwnedDmActor, isDmConversationForViewer, viewerDmMembership } from '@/lib/dmAccountScope';

type DMConversation = LoadedDMConversation;
const EMPTY_CONVERSATIONS: DMConversation[] = [];

function enrichLastMessageFromThreadCache(
  conv: DMConversation,
  queryClient: ReturnType<typeof useQueryClient>,
  session: ReportAccountSession,
): DMConversation {
  if (conv.last_message?.created_at) return conv;
  const thread = readMessagesCache(queryClient, conv.id, session);
  const latest = thread
    .filter((m) => !m.is_deleted)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  if (!latest) return conv;
  const existingSort = conv._sortTime || conv.last_message?.created_at || '';
  if (existingSort && latest.created_at <= existingSort) {
    return { ...conv, last_message: latest };
  }
  return {
    ...conv,
    last_message: latest,
    _sortTime: latest.created_at || conv._sortTime,
  };
}

/**
 * Hook that ensures all friends have DM conversations
 * and provides a sorted, searchable list of conversations
 */
export function useDMConversations(searchQuery: string = '') {
  const { user, profile, authReady } = useAuth();
  const queryClient = useQueryClient();
  const resolvedProfileId = useAuthProfileId();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile)
    || (user?.id && isOwnedDmActor(resolvedProfileId, user.id) ? resolvedProfileId : undefined);
  const ready = authReady && !!user?.id && session.uid === user.id;
  const guard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const { data: friendsRaw, isLoading: friendsLoading } = useFriends();
  const friends = ensureArray(friendsRaw);
  const attemptedFriendIdsRef = useRef<Set<string>>(new Set());

  const cachedConversations = useMemo(
    () => ready ? readDmConversationsCache(queryClient, profileId, user?.id, session) : EMPTY_CONVERSATIONS,
    [queryClient, profileId, user?.id, ready, session],
  );

  // Fetch all conversations with proper sorting.
  // Prefer profileId; fall back to authUid so cached list can paint before profile resolves.
  // Wait for authReady + user so we never hit Firestore with a cached profile id
  // before the OAuth custom token is attached (permission-denied spam).
  const listKeyId = profileId || user?.id || null;
  const selectConversations = useCallback((data: DMConversation[]) => {
    if (!data.length) return EMPTY_CONVERSATIONS;
    const filtered = normalizeDmConversationList<DMConversation>(data).filter(row => isDmConversationForViewer(row, profileId, user?.id));
    return filtered.length ? filtered : EMPTY_CONVERSATIONS;
  }, [profileId, user?.id]);
  const conversationsQuery = useQuery({
    queryKey: dmListQueryKey(listKeyId, session),
    queryFn: async () => {
      guard();
      const viewerId = profileId || user?.id;
      if (!viewerId) return [];
      const prev = readDmConversationsCache(queryClient, profileId, user?.id, session);
      // Prefer real profileId; if still resolving, still hit network with authUid
      // so inbox isn't stuck on "Signing in…" with an empty cache forever.
      const loadId = profileId || user?.id;
      if (!loadId) return prev;
      const { data, error, profileId: resolvedId } = await loadDMConversations(loadId, prev);
      guard();
      if (error) throw error;
      const merged = data.filter(row => isDmConversationForViewer(row, resolvedId, user?.id));

      {
        syncDmListCaches(queryClient, resolvedId, merged, session);
        if (profileId && resolvedId !== profileId) {
          syncDmListCaches(queryClient, profileId, merged, session);
        }
        if (user?.id && resolvedId !== user.id) {
          syncDmListCaches(queryClient, user.id, merged, session);
        }
      }

      queryClient.removeQueries({ queryKey: ['dm-conversations-soft-error'] });

      if (error && merged.length === 0) {
        console.warn('[DM] list load failed (showing empty):', error.message || error);
      }
      return merged;
    },
    enabled: ready && !!listKeyId,
    throwOnError: false,
    initialData: cachedConversations.length > 0 ? cachedConversations : undefined,
    select: selectConversations,
    // Treat persisted data as instantly displayable, then always revalidate
    // in the background on mount so the list is fresh without blocking paint.
    // Realtime + setQueryData patches keep the list fresh — avoid aggressive refetches.
    staleTime: 180_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: false,
    refetchOnMount: refetchListOnMount,
    refetchOnReconnect: false,
    // DM list must reach network on first load — offlineFirst can pause forever
    // with isFetched=false when connectivity is flaky (shows perpetual spinner).
    networkMode: 'always',
    retry: (failureCount, error) => shouldRetryQuery(failureCount, error, 2),
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const conversationList = useMemo(() => {
    if (!ready) return EMPTY_CONVERSATIONS;
    const base = normalizeDmConversationList<DMConversation>(
      conversationsQuery.data ?? cachedConversations,
    );
    if (!base.length) return EMPTY_CONVERSATIONS;
    return base.filter(row => isDmConversationForViewer(row, profileId, user?.id)).map((conv) => enrichLastMessageFromThreadCache(conv, queryClient, session));
  }, [conversationsQuery.data, cachedConversations, queryClient, ready, profileId, user?.id, session]);

  const conversationIdsKey = useMemo(
    () => [...new Set(conversationList.map((c) => c.id))].sort().join('\0'),
    [conversationList],
  );

  useEffect(() => {
    if (!profileId || !conversationIdsKey) return;
    // Idle-warm a few top threads only — never flood the network on inbox open.
    const ids = conversationIdsKey.split('\0').slice(0, 6);
    return scheduleIdleWork(() => {
      try { guard(); } catch { return; }
      warmDmConversationBatch(queryClient, ids, profileId, profileId);
    }, 1200);
  }, [conversationIdsKey, profileId, queryClient, guard]);

  // Auto-create conversations for friends who don't have one.
  // Read latest data from the cache on demand so this callback's identity
  // does NOT change every refetch (which was causing a render loop / flicker).
  const lastProcessedUpdateRef = useRef<number>(0);
  const ensureConversationsForFriends = useCallback(async () => {
    if (!ready || !profileId || !friends.length) return;
    try { guard(); } catch { return; }

    const raw = readDmConversationsCache(queryClient, profileId, user?.id);
    const conversations = raw;

    // Find friends without conversations
    const friendsWithConvos = new Set<string>();

    conversations.forEach(conv => {
      if (!conv.is_group) {
        safeDmMembers(conv.members).forEach(m => {
          if (!isViewerMember(String(m.user_id), profileId, user?.id) && m.profile?.id) {
            friendsWithConvos.add(String(m.profile.id));
          }
        });
      }
    });

    const friendsWithoutConvos = friends.filter(
      (friend: any) =>
        friend?.id &&
        !friendsWithConvos.has(friend.id) &&
        !attemptedFriendIdsRef.current.has(friend.id)
    );

    if (friendsWithoutConvos.length === 0) return;

    // Create conversations for friends without one (batch)
    let created = false;
    for (const friend of friendsWithoutConvos) {
      try { guard(); } catch { return; }
      if (!friend?.id) continue;
      attemptedFriendIdsRef.current.add(friend.id);

      try {
        await createDmChat(friend.id, guard);
        guard();
        created = true;
      } catch (error) {
        const denied = /permission|insufficient/i.test(String((error as { message?: string })?.message || ''));
        if (!denied) {
          console.error('Failed to create conversation for friend:', friend.id, error);
          attemptedFriendIdsRef.current.delete(friend.id);
        }
      }
    }

    if (created) {
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    }
  }, [profileId, friends, queryClient, user?.id, guard, ready]);

  // Run auto-creation once per data update; gated by dataUpdatedAt so
  // re-renders triggered by other state don't keep firing this effect.
  useEffect(() => {
    if (conversationsQuery.isLoading || friendsLoading) return;
    if (!friends?.length) return;
    if (conversationsQuery.dataUpdatedAt === lastProcessedUpdateRef.current) return;
    lastProcessedUpdateRef.current = conversationsQuery.dataUpdatedAt;
    return scheduleIdleWork(() => {
      void ensureConversationsForFriends();
    }, 4000);
  }, [
    conversationsQuery.isLoading,
    conversationsQuery.dataUpdatedAt,
    friendsLoading,
    friends,
    ensureConversationsForFriends,
  ]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (conversationList.length === 0) return [];
    if (!searchQuery.trim()) return conversationList;

    const query = searchQuery.toLowerCase().trim();
    
    return conversationList.filter(conv => {
      // For groups, search by group name
      if (conv.is_group) {
        return conv.name?.toLowerCase().includes(query);
      }

      // For DMs, search by username and display name
      const resolved = resolveOtherMemberFromConversation(conv, profileId, user?.id);
      const username = String(resolved?.profile?.username || '').toLowerCase();
      const displayName = String(resolved?.profile?.display_name || '').toLowerCase();
      
      return username.includes(query) || displayName.includes(query);
    });
  }, [conversationList, searchQuery, profileId, user?.id]);

  // Split into pinned and unpinned
  const { pinnedConversations, unpinnedConversations } = useMemo(() => {
    const pinned: DMConversation[] = [];
    const unpinned: DMConversation[] = [];

    filteredConversations.forEach(conv => {
      const viewer = viewerDmMembership(conv, profileId, user?.id);
      const isPinned = viewer?.is_pinned;
      if (isPinned) {
        pinned.push(conv);
      } else {
        unpinned.push(conv);
      }
    });

    return { pinnedConversations: pinned, unpinnedConversations: unpinned };
  }, [filteredConversations, profileId, user?.id]);

  // Calculate total unread count
  const totalUnreadCount = useMemo(() => {
    return conversationList.reduce(
      (sum, conv) => sum + (conv.unread_count || 0), 
      0
    );
  }, [conversationList]);

  const hasCachedList = conversationList.length > 0 || cachedConversations.length > 0;
  const isLoading =
    !hasCachedList &&
    !!profileId &&
    (conversationsQuery.isPending || conversationsQuery.isFetching) &&
    !conversationsQuery.isFetched;

  return {
    conversations: filteredConversations,
    pinnedConversations,
    unpinnedConversations,
    totalUnreadCount,
    isLoading,
    isFetched: conversationsQuery.isFetched,
    isFetching: conversationsQuery.isFetching,
    error: conversationsQuery.error,
    refetch: conversationsQuery.refetch,
    profileId,
  };
}

/**
 * Load a single conversation for ChatView — reads dm-conversations cache first,
 * then fetches members + profiles if the list cache missed it.
 */
export function useConversationDetail(conversationId: string | undefined) {
  const { profile, user, authReady } = useAuth();
  const resolvedProfileId = useAuthProfileId();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile)
    || (user?.id && isOwnedDmActor(resolvedProfileId, user.id) ? resolvedProfileId : undefined);
  const ready = authReady && !!user?.id && session.uid === user.id;
  const queryClient = useQueryClient();
  const guard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const findCachedConversation = useCallback(() => {
    if (!ready || !conversationId) return undefined;
    return readDmConversationsCache(queryClient, profileId, user?.id, session)
      .find(row => row.id === conversationId);
  }, [ready, conversationId, queryClient, profileId, user?.id, session]);
  const initialConversation = useMemo(findCachedConversation, [findCachedConversation]);

  const detailQuery = useQuery({
    queryKey: conversationDetailQueryKey(conversationId, session),
    initialData: initialConversation,
    queryFn: async (): Promise<DMConversation> => {
      guard();
      if (!conversationId || !user?.id) throw new Error('Open this conversation again after signing in.');
      const effectiveProfileId = profileId || user.id;
      const cached = findCachedConversation();
      const otherProfileId = inferOtherParticipantId(conversationId, effectiveProfileId, user.id);
      const conv = await fetchConversationForViewer(conversationId, effectiveProfileId, otherProfileId);
      guard();
      if (!conv || (Array.isArray(conv.member_ids) && !isDmConversationForViewer(conv, profileId, user.id))) {
        throw Object.assign(new Error('This conversation is not available to this account.'), { code: 'permission-denied' });
      }
      const { data: allMembers, error: membersError } = await db
        .from('conversation_members')
        .select('conversation_id, user_id, role, is_muted, is_pinned, last_read_at')
        .eq('conversation_id', conversationId);
      guard();
      const members = !membersError && allMembers?.length
        ? allMembers.filter(member => member.conversation_id === conversationId)
        : (Array.isArray(conv.member_ids) ? conv.member_ids : []).map(user_id => ({ conversation_id: conversationId, user_id, role: 'member' }));
      if (!isDmConversationForViewer({ ...conv, members }, profileId, user.id)) {
        throw Object.assign(new Error('This conversation is not available to this account.'), { code: 'permission-denied' });
      }
      const memberIds = [...new Set<string>(members.map(member => String(member.user_id)))];
      const profileByKey = await fetchMemberProfiles(memberIds);
      guard();
      return normalizeDmConversation({
        ...conv,
        members: members.map(member => ({ ...member, profile: profileByKey.get(String(member.user_id)) || null })),
        last_message: cached?.last_message ?? null,
        unread_count: cached?.unread_count ?? 0,
        _sortTime: cached?._sortTime ?? getDmConversationSortTime(conv as unknown as DMConversation),
        _hasUnread: cached?._hasUnread ?? false,
      } as DMConversation);
    },
    enabled: ready && !!conversationId,
    staleTime: 120_000,
    gcTime: 0,
    networkMode: 'always',
    refetchOnMount: true,
    retry: (count, error) => shouldRetryQuery(count, error, 1),
  });

  const normalizedDetail = useMemo(() => ready && isDmConversationForViewer(detailQuery.data, profileId, user?.id)
    ? normalizeDmConversation(detailQuery.data!) : undefined, [ready, detailQuery.data, profileId, user?.id]);
  return {
    ...detailQuery,
    data: normalizedDetail,
  };
}

/**
 * Hook to mark a conversation as read
 */
export function useMarkConversationRead() {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile);
  const guard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      guard();
      if (!profileId) throw new Error('Your profile is still loading.');
      const authUid = await getSessionAuthUid();
      guard();
      await markConversationReadForViewer(conversationId, profileId, authUid);
      guard();
      return { guard, session, profileId };
    },
    onSuccess: (operation, conversationId) => {
      try { operation.guard(); } catch { return; }
      let clearedCount = 0;
      const patch = (old: unknown) => {
        const list = readQueryArray<DMConversation>(old);
        if (!list.length) return list;
        return list.map((c) => {
          if (c.id === conversationId) {
            clearedCount = c.unread_count ?? 0;
            return { ...c, unread_count: 0, _hasUnread: false };
          }
          return c;
        });
      };
      queryClient.setQueryData(dmListQueryKey(operation.profileId, operation.session), patch);
      queryClient.setQueryData(['conversations', operation.profileId, operation.session.uid, operation.session.epoch], patch);
      queryClient.setQueryData<number>(['unread-messages-count', operation.profileId], (prev) =>
        typeof prev === 'number' ? Math.max(0, prev - clearedCount) : 0,
      );
    },
  });
}
