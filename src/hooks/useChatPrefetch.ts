import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';

/**
 * Prefetch chat data for instant notification → chat transitions.
 * Call this when notifications are loaded to pre-warm the cache.
 */
export function useChatPrefetch() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Prefetch conversation by user ID (for DM notifications)
  const prefetchConversation = useCallback(async (otherUserId: string) => {
    if (!profile?.id || !otherUserId) return;

    // Check if already cached
    const cached = queryClient.getQueryData(['conversation-by-user', otherUserId]);
    if (cached) return;

    try {
      // Find or create conversation with this user
      const { data: existingConv } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations!inner(id, is_group, name)
        `)
        .eq('user_id', profile.id)
        .limit(100);

      if (!existingConv) return;

      // Find the DM with this specific user
      for (const member of existingConv) {
        const { data: otherMembers } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', member.conversation_id)
          .neq('user_id', profile.id);

        if (otherMembers?.some(m => m.user_id === otherUserId)) {
          // Found the conversation - prefetch messages
          await prefetchMessages(member.conversation_id);
          queryClient.setQueryData(['conversation-by-user', otherUserId], member.conversation_id);
          return;
        }
      }
    } catch (error) {
      console.error('[ChatPrefetch] Error:', error);
    }
  }, [profile?.id, queryClient]);

  // Prefetch messages for a conversation
  const prefetchMessages = useCallback(async (conversationId: string) => {
    const cached = queryClient.getQueryData(['messages', conversationId]);
    if (cached) return;

    try {
      const { data } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, sender_id,
          media_url, media_type, is_deleted,
          sender:profiles!messages_sender_id_fkey(id, username, display_name, avatar_url)
        `)
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (data) {
        queryClient.setQueryData(['messages', conversationId], data.reverse());
      }
    } catch (error) {
      console.error('[ChatPrefetch] Messages error:', error);
    }
  }, [queryClient]);

  return { prefetchConversation, prefetchMessages };
}

/**
 * Auto-prefetch chats when notifications arrive
 */
export function useNotificationChatPrefetch() {
  const { profile } = useAuth();
  const { prefetchConversation } = useChatPrefetch();

  useEffect(() => {
    if (!profile?.id) return;

    const channel = subscribePostgresChannel(`notification-prefetch:${profile.id}`, [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
        callback: (payload) => {
          const type = payload.new?.type;
          const actorId = payload.new?.actor_id;
          
          if (actorId && ['message', 'friend_accepted', 'friend_request'].includes(type)) {
            prefetchConversation(actorId);
          }
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, prefetchConversation]);
}
