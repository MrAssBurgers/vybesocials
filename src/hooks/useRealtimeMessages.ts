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
 * Instant conversation list updates - global listener for new messages
 * Updates both conversation lists immediately when any message arrives
 */
export function useRealtimeConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('global-conversations-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMessage = payload.new as any;
          const isFromOther = newMessage.sender_id !== profile.id;
          
          // Helper to update conversation lists
          const updateConversations = (old: any[] | undefined) => {
            if (!old) return old;
            
            const conversationExists = old.some(c => c.id === newMessage.conversation_id);
            if (!conversationExists) {
              // New conversation - trigger full refetch
              return old;
            }
            
            const updated = old.map(conv => {
              if (conv.id === newMessage.conversation_id) {
                return {
                  ...conv,
                  last_message: newMessage,
                  updated_at: newMessage.created_at,
                  _sortTime: newMessage.created_at,
                  _hasUnread: isFromOther ? true : conv._hasUnread,
                  unread_count: isFromOther 
                    ? (conv.unread_count || 0) + 1 
                    : conv.unread_count,
                };
              }
              return conv;
            });
            
            // Sort by pinned first, then unread, then most recent
            return updated.sort((a, b) => {
              // Pinned first
              if (a.members && b.members) {
                const aIsPinned = a.members.find((m: any) => m.user_id === profile.id)?.is_pinned;
                const bIsPinned = b.members.find((m: any) => m.user_id === profile.id)?.is_pinned;
                if (aIsPinned && !bIsPinned) return -1;
                if (!aIsPinned && bIsPinned) return 1;
              }
              
              // Unread first
              if (a._hasUnread && !b._hasUnread) return -1;
              if (!a._hasUnread && b._hasUnread) return 1;
              
              // Then by time
              const timeA = new Date(a._sortTime || a.updated_at).getTime();
              const timeB = new Date(b._sortTime || b.updated_at).getTime();
              return timeB - timeA;
            });
          };
          
          // Update both query keys instantly
          queryClient.setQueryData<any[]>(['conversations', profile.id], updateConversations);
          queryClient.setQueryData<any[]>(['dm-conversations', profile.id], updateConversations);
          
          // If conversation doesn't exist in cache, trigger a refetch
          const existing = queryClient.getQueryData<any[]>(['conversations', profile.id]);
          if (existing && !existing.some(c => c.id === newMessage.conversation_id)) {
            queryClient.invalidateQueries({ queryKey: ['conversations', profile.id] });
            queryClient.invalidateQueries({ queryKey: ['dm-conversations', profile.id] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members' },
        () => {
          // Member changes need full refetch
          queryClient.invalidateQueries({ queryKey: ['conversations', profile.id] });
          queryClient.invalidateQueries({ queryKey: ['dm-conversations', profile.id] });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Conversations] Global realtime subscribed');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}
