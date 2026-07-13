import { useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { warmDmConversation } from '@/lib/warmDmConversation';

/**
 * Prefetch chat data for instant notification → chat transitions.
 * Call this when notifications are loaded to pre-warm the cache.
 */
export function useChatPrefetch() {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const actorId = profileId ?? profile?.id;
  const queryClient = useQueryClient();

  const prefetchMessages = useCallback(async (conversationId: string) => {
    if (!conversationId || !actorId) return;
    warmDmConversation(queryClient, conversationId, profileId, actorId);
  }, [actorId, profileId, queryClient]);

  const warmConversation = useCallback(
    (
      conversationId: string,
      priority: 'high' | 'normal' = 'high',
      conversationHint?: LoadedDMConversation | null,
    ) => {
      if (!actorId) return;
      warmDmConversation(queryClient, conversationId, profileId, actorId, priority, conversationHint);
    },
    [actorId, profileId, queryClient],
  );

  const prefetchConversation = useCallback(async (otherUserId: string) => {
    if (!profileId || !otherUserId) return;

    const cached = queryClient.getQueryData(['conversation-by-user', otherUserId]);
    if (cached) return;

    try {
      const { data: existingConv } = await db
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations!inner(id, is_group, name)
        `)
        .eq('user_id', profileId)
        .limit(100);

      if (!existingConv) return;

      for (const member of existingConv) {
        const { data: otherMembers } = await db
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', member.conversation_id)
          .neq('user_id', profileId);

        if (otherMembers?.some((m) => m.user_id === otherUserId)) {
          warmConversation(member.conversation_id);
          queryClient.setQueryData(['conversation-by-user', otherUserId], member.conversation_id);
          return;
        }
      }
    } catch (error) {
      console.error('[ChatPrefetch] Error:', error);
    }
  }, [profileId, queryClient, warmConversation]);

  return { prefetchConversation, prefetchMessages, warmConversation };
}

/**
 * Auto-prefetch chats when notifications arrive
 */
export function useNotificationChatPrefetch() {
  const profileId = useAuthProfileId();
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
