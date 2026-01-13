import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';
import { Message } from './useMessages';

/**
 * Snapchat-style realtime message sync
 * - Instant updates without full refetch
 * - Optimistic inserts with server confirmation
 * - Efficient cache updates
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const lastMessageIdRef = useRef<string | null>(null);

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

  // Subscribe to realtime changes
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
            // Just trigger a background refresh to get the final server data
            queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
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
          
          // Play sound if not in this conversation view
          const isViewingConvo = window.location.pathname.includes(conversationId);
          const isDocumentVisible = document.visibilityState === 'visible';
          
          if (!isViewingConvo || !isDocumentVisible) {
            callSounds.message();
          }
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
          
          if (updatedMessage.is_deleted) {
            removeMessageFromCache(updatedMessage.id);
          } else {
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
      .subscribe();

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
          
          // Play sound if message is from someone else
          if (newMessage.sender_id !== profile.id) {
            const currentConvo = window.location.pathname.match(/\/messages\/([a-f0-9-]+)/)?.[1];
            const isViewingConvo = currentConvo === newMessage.conversation_id;
            const isDocumentVisible = document.visibilityState === 'visible';
            
            if (!isViewingConvo || !isDocumentVisible) {
              callSounds.message();
            }
          }
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
