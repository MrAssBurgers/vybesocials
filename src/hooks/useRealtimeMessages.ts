import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

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

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`conv-events:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage = payload.new as any;
          
          // Handle deleted messages - remove from cache instantly
          if (updatedMessage.is_deleted) {
            removeMessageFromCache(updatedMessage.id);
          } else {
            // Handle edits - update in cache instantly
            updateMessageInCache(updatedMessage);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        () => {
          // Refresh to get updated reactions
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_views',
        },
        () => {
          // Refresh to get updated read receipts
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`[ConvRT] Subscribed to ${conversationId}`);
        }
      });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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
