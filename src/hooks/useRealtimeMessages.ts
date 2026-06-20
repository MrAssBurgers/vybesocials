import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { Message } from './useMessages';

/**
 * Conversation-specific realtime updates
 * 
 * Handles: reactions, views, edits (message-specific events)
 * NOTE: Message INSERT/DELETE events are handled by useGlobalRealtimeMessages
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const reactionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update existing message in cache (for edits)
  const updateMessageInCache = useCallback((updatedMessage: any) => {
    if (!conversationId) return;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return old;
      
      return old.map(m => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m);
    });
  }, [conversationId, queryClient]);

  // Remove message from cache (soft delete)
  const removeMessageFromCache = useCallback((messageId: string) => {
    if (!conversationId) return;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return old;
      return old.filter(m => m.id !== messageId);
    });
  }, [conversationId, queryClient]);

  // Subscribe to conversation-specific events (reactions, views, edits)
  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    // Reaction/view bursts used to invalidate the whole message list and refetch
    // (with membership repair), causing sent bubbles to vanish and the thread to lag.
    const scheduleReactionRefetch = () => {};
    const scheduleViewRefetch = () => {};

    // Track message ids that belong to this conversation so we can ignore
    // reaction/view events for unrelated messages.
    const knownMessageIds = () => {
      const list = queryClient.getQueryData<Message[]>(['messages', conversationId]);
      return new Set((list || []).map(m => m.id));
    };

    const channel = subscribePostgresChannel(
      `conv-events:${conversationId}`,
      [
        {
          event: 'UPDATE',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
          callback: (payload) => {
            const updatedMessage = payload.new as any;
            const oldMessage = payload.old as any;
            
            if (updatedMessage.is_deleted) {
              removeMessageFromCache(updatedMessage.id);
            } else {
              updateMessageInCache(updatedMessage);
              if (updatedMessage.viewed_at && !oldMessage?.viewed_at) {
                console.log('[ConvRT] VYBE viewed:', updatedMessage.id);
              }
            }
          },
        },
        {
          event: '*',
          table: 'message_reactions',
          callback: (payload) => {
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            scheduleReactionRefetch();
          },
        },
        {
          event: '*',
          table: 'message_views',
          callback: (payload) => {
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            scheduleViewRefetch();
          },
        },
      ],
      (status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[ConvRT] Subscribed to ${conversationId}`);
        }
      },
    );

    channelRef.current = channel;

    return () => {
      if (reactionDebounceRef.current) clearTimeout(reactionDebounceRef.current);
      if (viewDebounceRef.current) clearTimeout(viewDebounceRef.current);
      reactionDebounceRef.current = null;
      viewDebounceRef.current = null;
      removeRealtimeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [conversationId, profile?.id, queryClient, updateMessageInCache, removeMessageFromCache]);

  return {
    updateMessageInCache,
    removeMessageFromCache,
  };
}

/**
 * @deprecated Use useGlobalRealtimeMessages instead.
 * This is kept for backward compatibility but now delegates to the global handler.
 */
export function useRealtimeConversations() {
  // No-op: All realtime updates are now handled by useGlobalRealtimeMessages
  // This function is kept for backward compatibility with existing code
}
