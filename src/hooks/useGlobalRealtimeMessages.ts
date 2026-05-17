/**
 * Global Realtime Messages Hook
 * 
 * Runs at App level to ensure DM updates happen EVERYWHERE instantly
 * - Updates conversation list when ANY message arrives
 * - Plays notification sounds for messages from other users
 * - Ensures receiver sees messages instantly without refresh
 * - Includes deduplication and retry logic for reliability
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';

// Track the current conversation globally
let currentConversationId: string | null = null;

export function setCurrentConversationId(id: string | null) {
  currentConversationId = id;
}

// Deduplication: Track recently processed message IDs (30 second window)
const processedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30000;

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [id, timestamp] of processedMessages) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedMessages.delete(id);
    }
  }
}

function isMessageProcessed(messageId: string): boolean {
  cleanupProcessedMessages();
  return processedMessages.has(messageId);
}

function markMessageProcessed(messageId: string) {
  processedMessages.set(messageId, Date.now());
}

// Track optimistic messages to prevent duplicates for sender
const pendingOptimisticMessages = new Map<string, { content: string; senderId: string; timestamp: number }>();

export function registerOptimisticMessage(conversationId: string, content: string, senderId: string) {
  const key = `${conversationId}:${senderId}:${content?.slice(0, 50)}`;
  pendingOptimisticMessages.set(key, { content, senderId, timestamp: Date.now() });
  
  // Auto-cleanup after 10 seconds
  setTimeout(() => pendingOptimisticMessages.delete(key), 10000);
}

function isOptimisticDuplicate(conversationId: string, content: string, senderId: string): boolean {
  const key = `${conversationId}:${senderId}:${content?.slice(0, 50)}`;
  const pending = pendingOptimisticMessages.get(key);
  if (pending && Date.now() - pending.timestamp < 5000) {
    pendingOptimisticMessages.delete(key);
    return true;
  }
  return false;
}

// Connection state for retry logic
let retryCount = 0;
const MAX_RETRIES = 5;

// Debounced refetch for the unknown-conversation case so a burst of
// realtime messages doesn't trigger N back-to-back full list refetches.
let unknownConvoRefetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleUnknownConvoRefetch(qc: ReturnType<typeof useQueryClient>, profileId: string) {
  if (unknownConvoRefetchTimer) return;
  unknownConvoRefetchTimer = setTimeout(() => {
    unknownConvoRefetchTimer = null;
    qc.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    qc.invalidateQueries({ queryKey: ['conversations', profileId] });
  }, 300);
}

export function useGlobalRealtimeMessages() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setupChannel = useCallback(() => {
    if (!profile?.id) return;

    // Clean up existing channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    // Create a single global channel for all message events
    const channel = supabase
      .channel(`global-messages:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          const newMessage = payload.new as any;
          const conversationId = newMessage.conversation_id;
          const isFromCurrentUser = newMessage.sender_id === profile.id;
          const isViewingConvo = currentConversationId === conversationId;
          
          // Deduplication check
          if (isMessageProcessed(newMessage.id)) {
            if (import.meta.env.DEV) console.log('[GlobalRT] Skipping duplicate message:', newMessage.id);
            return;
          }
          markMessageProcessed(newMessage.id);
          
          if (import.meta.env.DEV) {
            console.log('[GlobalRT] Message received:', {
              id: newMessage.id,
              from: newMessage.sender_id,
              conv: conversationId,
              isFromCurrentUser,
              isViewingConvo,
            });
          }

          // Skip if this is an optimistic duplicate (sender already sees it)
          if (isFromCurrentUser && isOptimisticDuplicate(conversationId, newMessage.content, newMessage.sender_id)) {
            if (import.meta.env.DEV) console.log('[GlobalRT] Skipping optimistic duplicate for sender');
            return;
          }

          // If message is from another user, we need to update caches
          if (!isFromCurrentUser) {
            // Try to get sender from cached conversation members first
            let sender: any = null;
            const cachedConvos = queryClient.getQueryData<any[]>(['dm-conversations', profile.id]) || 
                                 queryClient.getQueryData<any[]>(['conversations', profile.id]);
            
            if (cachedConvos) {
              const cachedConvo = cachedConvos.find(c => c.id === conversationId);
              if (cachedConvo?.members) {
                const memberProfile = cachedConvo.members.find((m: any) => m.user_id === newMessage.sender_id)?.profile;
                if (memberProfile) {
                  sender = memberProfile;
                }
              }
            }

            // Only fetch from DB if not in cache
            if (!sender) {
              const { data: fetchedSender } = await supabase
                .from('profiles')
                .select('id, username, avatar_url, display_name')
                .eq('id', newMessage.sender_id)
                .maybeSingle();
              sender = fetchedSender;
            }

            const fullMessage = {
              ...newMessage,
              sender,
              views: [],
              reactions: [],
            };

            // If user is viewing this conversation, add message to chat
            if (isViewingConvo) {
              queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
                if (!old) return [fullMessage];
                // Prevent duplicates
                if (old.some(m => m.id === newMessage.id)) return old;
                return [...old, fullMessage];
              });
            }

            // Play notification sound if NOT viewing this conversation
            if (!isViewingConvo || document.visibilityState !== 'visible') {
              callSounds.message();
            }
          }

          // Always update conversation lists for both sender and receiver
          const updateConversations = (old: any[] | undefined) => {
            if (!old) return old;
            
            const conversationExists = old.some(c => c.id === conversationId);
            if (!conversationExists) {
              // Conversation not in cache - trigger refetch
              return old;
            }
            
            return old.map(conv => {
              if (conv.id === conversationId) {
                return {
                  ...conv,
                  last_message: {
                    id: newMessage.id,
                    content: newMessage.content,
                    media_type: newMessage.media_type,
                    media_url: newMessage.media_url,
                    created_at: newMessage.created_at,
                    sender_id: newMessage.sender_id,
                  },
                  updated_at: newMessage.created_at,
                  _sortTime: newMessage.created_at,
                  _hasUnread: !isFromCurrentUser && !isViewingConvo,
                  unread_count: !isFromCurrentUser && !isViewingConvo 
                    ? (conv.unread_count || 0) + 1 
                    : conv.unread_count,
                };
              }
              return conv;
            }).sort((a, b) => {
              // Pinned first
              const aIsPinned = a.members?.find((m: any) => m.user_id === profile.id)?.is_pinned;
              const bIsPinned = b.members?.find((m: any) => m.user_id === profile.id)?.is_pinned;
              if (aIsPinned && !bIsPinned) return -1;
              if (!aIsPinned && bIsPinned) return 1;
              
              // Then unread
              if (a._hasUnread && !b._hasUnread) return -1;
              if (!a._hasUnread && b._hasUnread) return 1;
              
              // Then by time
              const timeA = new Date(a._sortTime || a.updated_at).getTime();
              const timeB = new Date(b._sortTime || b.updated_at).getTime();
              return timeB - timeA;
            });
          };

          // Update ALL conversation query caches
          queryClient.setQueryData<any[]>(['conversations', profile.id], updateConversations);
          queryClient.setQueryData<any[]>(['dm-conversations', profile.id], updateConversations);

          // Only invalidate when the conversation is genuinely new to the cache.
          // The setQueryData patch above already handles known conversations
          // — invalidating in that case causes a full refetch and visible flicker.
          const cached = queryClient.getQueryData<any[]>(['dm-conversations', profile.id]);
          if (cached && !cached.some(c => c.id === conversationId)) {
            scheduleUnknownConvoRefetch(queryClient, profile.id);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        (payload) => {
          const updatedMessage = payload.new as any;
          const conversationId = updatedMessage.conversation_id;

          // Deduplication
          const updateKey = `update:${updatedMessage.id}:${updatedMessage.updated_at || updatedMessage.edited_at}`;
          if (isMessageProcessed(updateKey)) return;
          markMessageProcessed(updateKey);

          // Update message in cache for ALL conversations (not just the one being viewed)
          // This ensures unsend/edit reflects instantly for all participants
          queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
            if (!old) return old;
            
            if (updatedMessage.is_deleted) {
              return old.filter(m => m.id !== updatedMessage.id);
            }
            
            return old.map(m => m.id === updatedMessage.id ? { ...m, ...updatedMessage } : m);
          });

          // Also update conversation list to reflect unsent last message
          if (updatedMessage.is_deleted) {
            queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        (payload) => {
          const deletedMessage = payload.old as any;
          const conversationId = deletedMessage.conversation_id;

          if (!conversationId) return;

          // Remove from cache regardless of which conversation is being viewed
          queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
            if (!old) return old;
            return old.filter(m => m.id !== deletedMessage.id);
          });

          // Update conversation list
          queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }
      )
      .subscribe((status) => {
        if (import.meta.env.DEV) console.log('[GlobalRT] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          if (import.meta.env.DEV) console.log('[GlobalRT] ✅ Global realtime connected for user:', profile.id);
          retryCount = 0; // Reset retry count on successful connection
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[GlobalRT] ❌ Channel error - will retry');
          
          // Exponential backoff retry
          if (retryCount < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            retryCount++;
            if (import.meta.env.DEV) console.log(`[GlobalRT] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
            
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = setTimeout(() => {
              if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
              }
              setupChannel();
            }, delay);
          } else {
            if (import.meta.env.DEV) console.warn('[GlobalRT] Max retries reached, giving up');
          }
        }
        if (status === 'CLOSED') {
          if (import.meta.env.DEV) console.log('[GlobalRT] Channel closed');
        }
      });

    channelRef.current = channel;
  }, [profile?.id, queryClient]);

  // Broadcast listener for instant delivery on the currently viewed conversation
  const broadcastChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!profile?.id || !currentConversationId) {
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
      return;
    }

    const convoId = currentConversationId;
    const bc = supabase
      .channel(`dm-broadcast:${convoId}`)
      .on('broadcast', { event: 'new-message' }, (payload: any) => {
        const msg = payload.payload?.message;
        if (!msg || msg.sender_id === profile.id) return; // skip own messages
        if (isMessageProcessed(msg.id)) return;
        markMessageProcessed(msg.id);

        // Add to chat immediately
        queryClient.setQueryData<any[]>(['messages', convoId], (old) => {
          if (!old) return [msg];
          if (old.some(m => m.id === msg.id)) return old;
          return [...old, msg];
        });

        // Play sound if tab not visible
        if (document.visibilityState !== 'visible') {
          callSounds.message();
        }
      })
      .subscribe();

    broadcastChannelRef.current = bc;

    return () => {
      supabase.removeChannel(bc);
      broadcastChannelRef.current = null;
    };
  }, [profile?.id, queryClient]);

  useEffect(() => {
    setupChannel();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (channelRef.current) {
        if (import.meta.env.DEV) console.log('[GlobalRT] Cleaning up global channel');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
    };
  }, [setupChannel]);
}
