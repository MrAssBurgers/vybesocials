import { useEffect, useMemo, useCallback, useRef } from 'react';
// Track which friend ids we've already tried to create a DM for in this session.
// Using a module-level set (instead of a ref) means a transient failure can be
// retried on the next render cycle without being permanently locked out.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFriends } from '@/hooks/useFriends';
import type { Conversation, Message } from '@/hooks/useMessages';

interface DMConversation extends Conversation {
  _sortTime: string;
  _hasUnread: boolean;
}

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

      // Get conversation memberships
      const { data: membershipData, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at, is_pinned, is_muted')
        .eq('user_id', profile.id);

      if (membershipError) {
        console.error('[DM] membership query error:', membershipError);
        throw membershipError;
      }
      console.log('[DM] memberships found:', membershipData?.length || 0);
      if (!membershipData?.length) return [];

      const userConversationIds = membershipData.map(m => m.conversation_id);
      const membershipMap = new Map(membershipData.map(m => [m.conversation_id, m]));

      // Fetch hidden + trashed in parallel
      const [{ data: hiddenData }, { data: trashedData }] = await Promise.all([
        supabase.from('hidden_conversations').select('conversation_id').eq('user_id', profile.id),
        supabase.from('trashed_conversations').select('conversation_id').eq('user_id', profile.id),
      ]);
      const hiddenIds = new Set((hiddenData || []).map(h => h.conversation_id));
      const trashedIds = new Set((trashedData || []).map(t => t.conversation_id));

      // Split query: avoid fragile PostgREST embedded join.
      // 1) conversations themselves
      const { data: conversationsRaw, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .in('id', userConversationIds)
        .order('updated_at', { ascending: false });

      if (convError) {
        console.error('[DM] conversations query error:', convError);
        throw convError;
      }
      console.log('[DM] conversations returned:', conversationsRaw?.length || 0);
      if (!conversationsRaw?.length) return [];

      // 2) all members for those conversations (flat)
      const { data: allMembers, error: membersError } = await supabase
        .from('conversation_members')
        .select('conversation_id, user_id, role, is_muted, is_pinned, last_read_at')
        .in('conversation_id', userConversationIds);

      if (membersError) {
        console.error('[DM] all-members query error:', membersError);
      }

      // 3) profiles for every member user_id
      const memberUserIds = Array.from(new Set((allMembers || []).map(m => m.user_id)));
      const { data: memberProfiles, error: profilesError } = memberUserIds.length
        ? await supabase
            .from('profiles')
            .select('id, user_id, username, avatar_url, display_name')
            .in('id', memberUserIds)
        : { data: [], error: null } as any;

      if (profilesError) {
        console.error('[DM] member profiles query error:', profilesError);
      }
      const profileById = new Map((memberProfiles || []).map((p: any) => [p.id, p]));

      // Stitch members onto each conversation
      const membersByConv = new Map<string, any[]>();
      (allMembers || []).forEach(m => {
        const arr = membersByConv.get(m.conversation_id) || [];
        arr.push({ ...m, profile: profileById.get(m.user_id) || null });
        membersByConv.set(m.conversation_id, arr);
      });

      const conversationsData = conversationsRaw.map(c => ({
        ...c,
        members: membersByConv.get(c.id) || [],
      }));

      // Batch fetch last messages for all conversations.
      // Slim payload: only the fields the conversation list actually renders.
      // Hard cap at 200 rows total — enough to find the most recent per chat
      // without dragging the entire message history across the wire.
      const convIds = conversationsData.map(c => c.id);
      const { data: allMessages } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, media_type, viewed_at, created_at')
        .in('conversation_id', convIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(Math.max(200, convIds.length * 3));

      // Group messages by conversation and get the latest one
      const lastMessageMap = new Map<string, any>();
      const unreadCountMap = new Map<string, number>();

      (allMessages || []).forEach(msg => {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }

        // Count unread messages
        const membership = membershipMap.get(msg.conversation_id);
        const lastReadAt = membership?.last_read_at || '1970-01-01';
        
        if (msg.sender_id !== profile.id && msg.created_at > lastReadAt) {
          unreadCountMap.set(
            msg.conversation_id, 
            (unreadCountMap.get(msg.conversation_id) || 0) + 1
          );
        }
      });

      // Build final result - deduplicate by other member for 1:1 DMs
      const seenOtherUserIds = new Set<string>();
      const result: DMConversation[] = [];

      conversationsData
        .filter(conv => !hiddenIds.has(conv.id) && !trashedIds.has(conv.id))
        .forEach(conv => {
          // For 1:1 DMs, deduplicate by other user
          if (!conv.is_group) {
            const otherMember = conv.members?.find((m: any) => m.user_id !== profile.id);
            const otherUserId = otherMember?.user_id;
            if (otherUserId) {
              if (seenOtherUserIds.has(otherUserId)) return; // skip duplicate
              seenOtherUserIds.add(otherUserId);
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
          });
        });

      // Instagram-style sorting: unread first, then by last activity
      result.sort((a, b) => {
        // Pinned conversations first
        const aIsPinned = a.members?.find(m => m.user_id === profile.id)?.is_pinned;
        const bIsPinned = b.members?.find(m => m.user_id === profile.id)?.is_pinned;
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;

       // If both are pinned, keep stable order (by conversation creation date)
       if (aIsPinned && bIsPinned) {
         return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
       }

       // For unpinned: unread first, then by last activity
       if (a._hasUnread && !b._hasUnread) return -1;
       if (!a._hasUnread && b._hasUnread) return 1;
       
        const timeA = new Date(a._sortTime).getTime();
        const timeB = new Date(b._sortTime).getTime();
        return timeB - timeA;
      });

      return result;
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: true,
    refetchOnMount: true, // only refetch when stale (avoids flicker on remount)
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
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
    isLoading: !conversationsQuery.data && (conversationsQuery.isLoading || friendsLoading),
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
    },
  });
}
