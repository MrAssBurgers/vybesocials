import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { premiumSounds } from '@/lib/premiumSounds';
import { Message } from './useMessages';

/**
 * Ultra-fast realtime message sync
 * - Instant updates without full refetch
 * - Optimistic inserts with server confirmation
 * - Efficient cache updates
 * - No debouncing for maximum speed
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastMessageIdRef = useRef<string | null>(null);
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Append a new message to cache instantly without refetching
  const appendMessageToCache = useCallback((newMessage: any) => {
    if (!conversationId) return;
    
    // Prevent duplicate additions
    if (lastMessageIdRef.current === newMessage.id) return;
    lastMessageIdRef.current = newMessage.id;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return [newMessage];
      
      // Check if message already exists
      if (old.some(m => m.id === newMessage.id)) return old;
      
      return [...old, newMessage];
    });

    // Also update conversation list immediately
    queryClient.setQueryData<any[]>(['conversations', profile?.id], (old) => {
      if (!old) return old;
      
      return old.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            last_message: newMessage,
            updated_at: newMessage.created_at,
            _sortTime: newMessage.created_at,
            unread_count: newMessage.sender_id !== profile?.id 
              ? (conv.unread_count || 0) + 1 
              : conv.unread_count,
          };
        }
        return conv;
      }).sort((a, b) => {
        const timeA = new Date(a._sortTime || a.updated_at).getTime();
        const timeB = new Date(b._sortTime || b.updated_at).getTime();
        return timeB - timeA;
      });
    });
  }, [conversationId, profile?.id, queryClient]);

  // Update existing message in cache (for reactions, edits, deletes)
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

  // Subscribe to realtime changes with improved instant updates
  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    const channel = supabase
      .channel(`instant-messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Skip if it's our own message (we handle optimistic updates separately)
          if (newMessage.sender_id === profile.id) {
            // Quietly sync - don't refetch, just ensure it's in cache
            return;
          }
          
          // Fetch sender info for the new message
          const { data: sender } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name')
            .eq('id', newMessage.sender_id)
            .single();
          
          const fullMessage = {
            ...newMessage,
            sender,
            views: [],
            reactions: [],
          };
          
          // Add to cache instantly
          appendMessageToCache(fullMessage);
          
          // Sound is handled by useMessageNotifications to avoid duplicates
        }
      )
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
          // Refresh to get updated reactions - could be optimized further
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
          console.log(`[Realtime] Subscribed to messages for ${conversationId}`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profile?.id, queryClient, appendMessageToCache, updateMessageInCache, removeMessageFromCache]);

  return {
    appendMessageToCache,
    updateMessageInCache,
    removeMessageFromCache,
  };
}

/**
 * Instant conversation list updates
 */
export function useRealtimeConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('instant-conversations')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Instantly update conversation list
          queryClient.setQueryData<any[]>(['conversations', profile.id], (old) => {
            if (!old) return old;
            
            const updated = old.map(conv => {
              if (conv.id === newMessage.conversation_id) {
                const isFromOther = newMessage.sender_id !== profile.id;
                return {
                  ...conv,
                  last_message: newMessage,
                  updated_at: newMessage.created_at,
                  _sortTime: newMessage.created_at,
                  unread_count: isFromOther 
                    ? (conv.unread_count || 0) + 1 
                    : conv.unread_count,
                };
              }
              return conv;
            });
            
            // Sort by most recent
            return updated.sort((a, b) => {
              const timeA = new Date(a._sortTime || a.updated_at).getTime();
              const timeB = new Date(b._sortTime || b.updated_at).getTime();
              return timeB - timeA;
            });
          });
          
          // Sound is handled by useMessageNotifications to avoid duplicates
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['conversations', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}
