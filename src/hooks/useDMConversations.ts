import { useEffect, useMemo, useCallback, useRef } from 'react';
// Track which friend ids we've already tried to create a DM for in this session.
// Using a module-level set (instead of a ref) means a transient failure can be
// retried on the next render cycle without being permanently locked out.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import { loadDMConversations, type LoadedDMConversation } from '@/lib/loadDMConversations';
import { refetchListOnMount } from '@/lib/queryRefetchPolicy';

type DMConversation = LoadedDMConversation;

/**
 * Hook that ensures all friends have DM conversations
 * and provides a sorted, searchable list of conversations
 */
export function useDMConversations(searchQuery: string = '') {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: friends, isLoading: friendsLoading } = useFriends();
  const attemptedFriendIdsRef = useRef<Set<string>>(new Set());

  // Fetch all conversations with proper sorting
  const conversationsQuery = useQuery({
    queryKey: ['dm-conversations', profile?.id],
    // No polling - rely on realtime for updates (more stable)
    queryFn: async () => {
      if (!profile?.id) return [];
      const prev = queryClient.getQueryData<DMConversation[]>(['dm-conversations', profile.id]);
      return loadDMConversations(profile.id, prev);
    },
    enabled: !!profile?.id,
    // Treat persisted data as instantly displayable, then always revalidate
    // in the background on mount so the list is fresh without blocking paint.
    // Realtime + setQueryData patches keep the list fresh — avoid aggressive
    // refetches that make the Messages tab visibly reload / flicker.
    staleTime: 120_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: false,
    refetchOnMount: refetchListOnMount,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    // 'offlineFirst' so the hydrated cache shows even when the network is
    // momentarily unreachable on cold start (e.g. flaky mobile data). The
    // background refetch still runs the moment connectivity is available.
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Auto-create conversations for friends who don't have one.
  // Read latest data from the cache on demand so this callback's identity
  // does NOT change every refetch (which was causing a render loop / flicker).
  const lastProcessedUpdateRef = useRef<number>(0);
  const ensureConversationsForFriends = useCallback(async () => {
    if (!profile?.id || !friends?.length) return;

    const conversations =
      queryClient.getQueryData<DMConversation[]>(['dm-conversations', profile.id]) || [];

    // Find friends without conversations
    const friendsWithConvos = new Set<string>();

    conversations.forEach(conv => {
      if (!conv.is_group) {
        conv.members?.forEach(m => {
          if (m.user_id !== profile.id && m.profile?.id) {
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
        const { error } = await supabase.rpc('create_dm_conversation', {
          other_profile_id: friend.id,
        });
        if (error) {
          // Allow a retry on next data update if it failed
          attemptedFriendIdsRef.current.delete(friend.id);
        } else {
          created = true;
        }
      } catch (error) {
        console.error('Failed to create conversation for friend:', friend.id, error);
        attemptedFriendIdsRef.current.delete(friend.id);
      }
    }

    if (created) {
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', profile.id] });
    }
  }, [profile?.id, friends, queryClient]);

  // Run auto-creation once per data update; gated by dataUpdatedAt so
  // re-renders triggered by other state don't keep firing this effect.
  useEffect(() => {
    if (conversationsQuery.isLoading || friendsLoading) return;
    if (!friends?.length) return;
    if (conversationsQuery.dataUpdatedAt === lastProcessedUpdateRef.current) return;
    lastProcessedUpdateRef.current = conversationsQuery.dataUpdatedAt;
    ensureConversationsForFriends();
  }, [
    conversationsQuery.isLoading,
    conversationsQuery.dataUpdatedAt,
    friendsLoading,
    friends,
    ensureConversationsForFriends,
  ]);

  // Filter conversations by search query
  const filteredConversations = useMemo(() => {
    if (!conversationsQuery.data) return [];
    if (!searchQuery.trim()) return conversationsQuery.data;

    const query = searchQuery.toLowerCase().trim();
    
    return conversationsQuery.data.filter(conv => {
      // For groups, search by group name
      if (conv.is_group) {
        return conv.name?.toLowerCase().includes(query);
      }

      // For DMs, search by username and display name
      const otherMember = conv.members?.find(m => m.user_id !== profile?.id);
      const username = otherMember?.profile?.username?.toLowerCase() || '';
      const displayName = otherMember?.profile?.display_name?.toLowerCase() || '';
      
      return username.includes(query) || displayName.includes(query);
    });
  }, [conversationsQuery.data, searchQuery, profile?.id]);

  // Split into pinned and unpinned
  const { pinnedConversations, unpinnedConversations } = useMemo(() => {
    const pinned: DMConversation[] = [];
    const unpinned: DMConversation[] = [];

    filteredConversations.forEach(conv => {
      const isPinned = conv.members?.find(m => m.user_id === profile?.id)?.is_pinned;
      if (isPinned) {
        pinned.push(conv);
      } else {
        unpinned.push(conv);
      }
    });

    return { pinnedConversations: pinned, unpinnedConversations: unpinned };
  }, [filteredConversations, profile?.id]);

  // Calculate total unread count
  const totalUnreadCount = useMemo(() => {
    return (conversationsQuery.data || []).reduce(
      (sum, conv) => sum + (conv.unread_count || 0), 
      0
    );
  }, [conversationsQuery.data]);

  return {
    conversations: filteredConversations,
    pinnedConversations,
    unpinnedConversations,
    totalUnreadCount,
    isLoading: conversationsQuery.isPending && !conversationsQuery.data?.length,
    isFetched: conversationsQuery.isFetched,
    isFetching: conversationsQuery.isFetching,
    error: conversationsQuery.error,
    refetch: conversationsQuery.refetch,
  };
}

/**
 * Hook to mark a conversation as read
 */
export function useMarkConversationRead() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) return;

      const { error } = await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: (_data, conversationId) => {
      if (!profile?.id) return;
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
      queryClient.setQueryData(['dm-conversations', profile.id], patch);
      queryClient.setQueryData(['conversations', profile.id], patch);
      queryClient.setQueryData<number>(['unread-messages-count', profile.id], (prev) =>
        typeof prev === 'number' ? Math.max(0, prev - clearedCount) : 0,
      );
    },
  });
}
