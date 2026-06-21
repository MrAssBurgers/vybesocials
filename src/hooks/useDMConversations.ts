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
  syncDmListCaches,
  type LoadedDMConversation,
} from '@/lib/loadDMConversations';
import { refetchListOnMount } from '@/lib/queryRefetchPolicy';
import { resolveSessionProfileId, syncSessionProfileId } from '@/lib/resolveSessionProfileId';
import { withTimeout } from '@/lib/withTimeout';
import { markConversationReadForViewer, getSessionAuthUid } from '@/lib/markConversationRead';
import {
  fetchMemberProfiles,
  resolveDmActorIds,
  ensureConversationReady,
  fetchConversationForViewer,
  inferOtherParticipantId,
  buildConversationPlaceholder,
} from '@/lib/dmMembershipRepair';
import { createDmChat } from '@/lib/firebase/chats';

type DMConversation = LoadedDMConversation;

/**
 * Hook that ensures all friends have DM conversations
 * and provides a sorted, searchable list of conversations
 */
export function useDMConversations(searchQuery: string = '') {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const cachedProfileId = syncSessionProfileId(profile?.id);
  const suspectAuthUidAsProfileId = !!(
    user?.id &&
    (cachedProfileId === user.id || (profile?.id === user.id && profile?.user_id === user.id))
  );

  const profileResolveQuery = useQuery({
    queryKey: ['session-profile-id', user?.id],
    queryFn: () =>
      withTimeout(
        resolveSessionProfileId(profile?.id),
        8_000,
        'Profile resolve timed out',
      ),
    enabled: !!user?.id && (!cachedProfileId || suspectAuthUidAsProfileId),
    staleTime: 60_000,
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
    networkMode: 'always',
  });

  const profileId =
    profileResolveQuery.data ??
    (suspectAuthUidAsProfileId ? undefined : cachedProfileId) ??
    undefined;
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const attemptedFriendIdsRef = useRef<Set<string>>(new Set());
  const dmInitialFetchDoneRef = useRef(false);

  // Fetch all conversations with proper sorting
  const conversationsQuery = useQuery({
    queryKey: ['dm-conversations', profileId],
    // No polling - rely on realtime for updates (more stable)
    queryFn: async () => {
      if (!profileId) return [];
      const prev = queryClient.getQueryData<DMConversation[]>(['dm-conversations', profileId]);
      const { data, error, profileId: resolvedId } = await loadDMConversations(profileId, prev);

      syncDmListCaches(queryClient, resolvedId, data);
      if (resolvedId !== profileId) {
        syncDmListCaches(queryClient, profileId, data);
      }

      const softErrorKey = ['dm-conversations-soft-error', resolvedId] as const;
      if (error && data.length > 0) {
        queryClient.setQueryData(softErrorKey, error.message);
      } else {
        queryClient.removeQueries({ queryKey: softErrorKey });
      }

      if (error && data.length === 0) throw error;
      return data;
    },
    enabled: !!profileId,
    // Treat persisted data as instantly displayable, then always revalidate
    // in the background on mount so the list is fresh without blocking paint.
    // Realtime + setQueryData patches keep the list fresh — avoid aggressive refetches.
    staleTime: 180_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: false,
    refetchOnMount: refetchListOnMount,
    refetchOnReconnect: false,
    placeholderData: (prev) => prev,
    // DM list must reach network on first load — offlineFirst can pause forever
    // with isFetched=false when connectivity is flaky (shows perpetual spinner).
    networkMode: 'always',
    retry: 1,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
  });

  const conversationList = useMemo(
    () => (Array.isArray(conversationsQuery.data) ? conversationsQuery.data : []),
    [conversationsQuery.data],
  );

  // Auto-create conversations for friends who don't have one.
  // Read latest data from the cache on demand so this callback's identity
  // does NOT change every refetch (which was causing a render loop / flicker).
  const lastProcessedUpdateRef = useRef<number>(0);
  const ensureConversationsForFriends = useCallback(async () => {
    if (!profileId || !friends?.length) return;

    const raw = queryClient.getQueryData<DMConversation[]>(['dm-conversations', profileId]);
    const conversations = Array.isArray(raw) ? raw : [];

    // Find friends without conversations
    const friendsWithConvos = new Set<string>();

    conversations.forEach(conv => {
      if (!conv.is_group) {
        conv.members?.forEach(m => {
          if (m.user_id !== profileId && m.profile?.id) {
            friendsWithConvos.add(m.profile.id);
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
      if (!friend?.id) continue;
      attemptedFriendIdsRef.current.add(friend.id);

      try {
        await createDmChat(friend.id);
        created = true;
      } catch (error) {
        console.error('Failed to create conversation for friend:', friend.id, error);
        attemptedFriendIdsRef.current.delete(friend.id);
      }
    }

    if (created) {
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    }
  }, [profileId, friends, queryClient]);

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
      const otherMember = conv.members?.find(m => m.user_id !== profileId);
      const username = otherMember?.profile?.username?.toLowerCase() || '';
      const displayName = otherMember?.profile?.display_name?.toLowerCase() || '';
      
      return username.includes(query) || displayName.includes(query);
    });
  }, [conversationList, searchQuery, profileId]);

  // Split into pinned and unpinned
  const { pinnedConversations, unpinnedConversations } = useMemo(() => {
    const pinned: DMConversation[] = [];
    const unpinned: DMConversation[] = [];

    filteredConversations.forEach(conv => {
      const isPinned = conv.members?.find(m => m.user_id === profileId)?.is_pinned;
      if (isPinned) {
        pinned.push(conv);
      } else {
        unpinned.push(conv);
      }
    });

    return { pinnedConversations: pinned, unpinnedConversations: unpinned };
  }, [filteredConversations, profileId]);

  // Calculate total unread count
  const totalUnreadCount = useMemo(() => {
    return conversationList.reduce(
      (sum, conv) => sum + (conv.unread_count || 0), 
      0
    );
  }, [conversationList]);

  const listCount = conversationList.length;
  const resolvingProfile =
    !!user?.id && !profileId && (profileResolveQuery.isFetching || profileResolveQuery.isPending);
  // Latch off loading after first fetch settles — prior logs showed loadDM done in <1s but skeleton stuck.
  if (conversationsQuery.isFetched) {
    dmInitialFetchDoneRef.current = true;
  }
  const isLoading =
    resolvingProfile ||
    (!dmInitialFetchDoneRef.current &&
      !!profileId &&
      (conversationsQuery.isPending || !conversationsQuery.isFetched));

  const softErrorKey = profileId ? (['dm-conversations-soft-error', profileId] as const) : null;
  const fetchWarning =
    (softErrorKey ? queryClient.getQueryData<string>(softErrorKey) : null) ?? null;

  return {
    conversations: filteredConversations,
    pinnedConversations,
    unpinnedConversations,
    totalUnreadCount,
    isLoading,
    isFetched: conversationsQuery.isFetched,
    isFetching: conversationsQuery.isFetching,
    error: conversationsQuery.error,
    fetchWarning,
    refetch: conversationsQuery.refetch,
    profileId,
  };
}

/**
 * Load a single conversation for ChatView — reads dm-conversations cache first,
 * then fetches members + profiles if the list cache missed it.
 */
export function useConversationDetail(conversationId: string | undefined) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const findCachedConversation = useCallback(
    (viewerId?: string | null) => {
      if (!conversationId) return undefined;
      const keys = [viewerId, profileId, profile?.id].filter(Boolean) as string[];
      for (const key of keys) {
        const hit =
          queryClient.getQueryData<DMConversation[]>(['dm-conversations', key])?.find(
            (c) => c.id === conversationId,
          ) ??
          queryClient.getQueryData<DMConversation[]>(['conversations', key])?.find(
            (c) => c.id === conversationId,
          );
        if (hit) return hit;
      }
      for (const [, data] of queryClient.getQueriesData<DMConversation[]>({
        queryKey: ['dm-conversations'],
      })) {
        const hit = data?.find((c) => c.id === conversationId);
        if (hit) return hit;
      }
      return undefined;
    },
    [conversationId, profileId, profile?.id, queryClient],
  );

  return useQuery({
    queryKey: ['conversation-detail', profileId, conversationId],
    queryFn: async (): Promise<DMConversation> => {
      if (!conversationId) {
        throw new Error('Missing conversation id');
      }

      const { profileId: effectiveProfileId } = await resolveDmActorIds(profile?.id ?? profileId);
      const fallback = () =>
        (findCachedConversation(effectiveProfileId) ??
          buildConversationPlaceholder(conversationId, effectiveProfileId)) as DMConversation;

      if (!effectiveProfileId) return fallback();

      const cached = findCachedConversation(effectiveProfileId);
      if (cached?.members?.length && cached.members.some((m) => m.profile?.username)) {
        return cached;
      }

      const enrichCachedMembers = async (base: DMConversation, memberIds: string[]) => {
        const profileByKey = await fetchMemberProfiles(memberIds);
        const members = memberIds.map((user_id) => ({
          conversation_id: conversationId,
          user_id,
          role: 'member',
          is_muted: false,
          is_pinned: false,
          last_read_at: null,
          profile: profileByKey.get(user_id) || null,
        }));
        return { ...base, members } as DMConversation;
      };

      if (cached?.members?.length) {
        const memberIds = cached.members.map((m) => m.user_id).filter(Boolean);
        return enrichCachedMembers(cached, memberIds);
      }

      try {
        const otherFromCached = cached?.members?.find(
          (m) => m.user_id !== effectiveProfileId,
        )?.user_id;
        const otherProfileId =
          otherFromCached || inferOtherParticipantId(conversationId, effectiveProfileId);

        const conv = await fetchConversationForViewer(
          conversationId,
          effectiveProfileId,
          otherProfileId,
        );
        if (!conv) return fallback();

        const { data: allMembers, error: membersError } = await db
          .from('conversation_members')
          .select('conversation_id, user_id, role, is_muted, is_pinned, last_read_at')
          .eq('conversation_id', conversationId);

        let members: Array<Record<string, unknown>>;

        if (membersError || !allMembers?.length) {
          if (membersError) {
            console.warn('[DM] conversation_members query failed:', membersError.message);
          }
          const memberIds = [
            ...new Set(
              ((conv.member_ids as string[]) || []).filter(Boolean),
            ),
          ] as string[];
          const profileByKey = await fetchMemberProfiles(memberIds);
          members = memberIds.map((user_id) => ({
            conversation_id: conversationId,
            user_id,
            role: 'member',
            profile: profileByKey.get(user_id) || null,
          }));
        } else {
          const memberUserIds = Array.from(new Set(allMembers.map((m) => String(m.user_id)))) as string[];
          const profileByKey = await fetchMemberProfiles(memberUserIds);
          members = allMembers.map((m) => ({
            ...m,
            profile: profileByKey.get(m.user_id) || null,
          }));
        }

        return {
          ...conv,
          members,
          last_message: cached?.last_message ?? null,
          unread_count: cached?.unread_count ?? 0,
          _sortTime: cached?._sortTime ?? conv.updated_at,
          _hasUnread: cached?._hasUnread ?? false,
        } as DMConversation;
      } catch (err) {
        console.warn('[DM] conversation detail fetch failed:', err);
        return fallback();
      }
    },
    enabled: !!conversationId,
    staleTime: 120_000,
    placeholderData: () => {
      if (!conversationId) return undefined;
      return (
        findCachedConversation(profileId) ??
        (buildConversationPlaceholder(conversationId, profileId) as DMConversation)
      );
    },
    networkMode: 'offlineFirst',
    retry: 1,
  });
}

/**
 * Hook to mark a conversation as read
 */
export function useMarkConversationRead() {
  const { profile } = useAuth();
  const profileId = syncSessionProfileId(profile?.id);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) return;
      const authUid = await getSessionAuthUid();
      await markConversationReadForViewer(conversationId, profileId, authUid);
    },
    onSuccess: (_data, conversationId) => {
      if (!profileId) return;
      let clearedCount = 0;
      const patch = (old: DMConversation[] | undefined) => {
        if (!old) return old;
        return old.map((c) => {
          if (c.id === conversationId) {
            clearedCount = c.unread_count ?? 0;
            return { ...c, unread_count: 0, _hasUnread: false };
          }
          return c;
        });
      };
      queryClient.setQueryData(['dm-conversations', profileId], patch);
      queryClient.setQueryData(['conversations', profileId], patch);
      queryClient.setQueryData<number>(['unread-messages-count', profileId], (prev) =>
        typeof prev === 'number' ? Math.max(0, prev - clearedCount) : 0,
      );
    },
  });
}
