import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { Message } from './useMessages';

/**
 * Conversation-specific realtime updates (reactions + views only).
 *
 * Message INSERT/UPDATE/DELETE are handled by useGlobalRealtimeMessages
 * via dmScopedMessageRealtime — do not duplicate message listeners here.
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);

  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    const knownMessageIds = () => {
      const list = queryClient.getQueryData<Message[]>(['messages', conversationId]);
      return new Set((list || []).map(m => m.id));
    };

    const channel = subscribePostgresChannel(
      `conv-events:${conversationId}`,
      [
        {
          event: '*',
          table: 'message_reactions',
          callback: (payload) => {
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          },
        },
        {
          event: '*',
          table: 'message_views',
          callback: (payload) => {
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          },
        },
      ],
      (status) => {
        if (status === 'SUBSCRIBED' && import.meta.env.DEV) {
          console.log(`[ConvRT] Subscribed to ${conversationId}`);
        }
      },
    );

    channelRef.current = channel;

    return () => {
      removeRealtimeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [conversationId, profile?.id, queryClient]);

  return {};
}

/**
 * @deprecated Use useGlobalRealtimeMessages instead.
 * This is kept for backward compatibility but now delegates to the global handler.
 */
export function useRealtimeConversations() {
  // No-op: All realtime updates are now handled by useGlobalRealtimeMessages
  // This function is kept for backward compatibility with existing code
}
