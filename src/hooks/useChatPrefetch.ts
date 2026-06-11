import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
import type { Message } from '@/hooks/useMessages';

const PREFETCH_SELECT = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name),
  views:message_views(user_id, viewed_at),
  reactions:message_reactions(user_id, emoji)
`;

/**
 * Prefetch chat data for instant notification → chat transitions.
 * Call this when notifications are loaded to pre-warm the cache.
 */
export function useChatPrefetch() {
  const { profile } = useAuth();
  const profileId = getEffectiveProfileId(profile?.id);
  const queryClient = useQueryClient();

  const prefetchMessages = useCallback(async (conversationId: string) => {
    const cached = queryClient.getQueryData<Message[]>(['messages', conversationId]);
    if (cached && cached.length > 0) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select(PREFETCH_SELECT)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(40);

      if (error) throw error;
      if (data) {
        queryClient.setQueryData<Message[]>(['messages', conversationId], data.reverse() as Message[]);
      }
    } catch (error) {
      console.error('[ChatPrefetch] Messages error:', error);
    }
  }, [queryClient]);

  const prefetchConversation = useCallback(async (otherUserId: string) => {
    if (!profileId || !otherUserId) return;

    const cached = queryClient.getQueryData(['conversation-by-user', otherUserId]);
    if (cached) return;

    try {
      const { data: existingConv } = await supabase
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations!inner(id, is_group, name)
        `)
        .eq('user_id', profileId)
        .limit(100);

      if (!existingConv) return;

      for (const member of existingConv) {
        const { data: otherMembers } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', member.conversation_id)
          .neq('user_id', profileId);

        if (otherMembers?.some((m) => m.user_id === otherUserId)) {
          await prefetchMessages(member.conversation_id);
          queryClient.setQueryData(['conversation-by-user', otherUserId], member.conversation_id);
          return;
        }
      }
    } catch (error) {
      console.error('[ChatPrefetch] Error:', error);
    }
  }, [profileId, queryClient, prefetchMessages]);

  return { prefetchConversation, prefetchMessages };
}

/**
 * Auto-prefetch chats when notifications arrive
 */
export function useNotificationChatPrefetch() {
  const { profile } = useAuth();
  const profileId = getEffectiveProfileId(profile?.id);
  const { prefetchConversation } = useChatPrefetch();

  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel(`notification-prefetch:${profileId}`, [
      {
        event: 'INSERT',
        table: 'notifications',
        filter: `user_id=eq.${profileId}`,
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
  }, [profileId, prefetchConversation]);
}
