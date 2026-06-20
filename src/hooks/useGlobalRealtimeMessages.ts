/**
 * Global Realtime Messages Hook
 * 
 * Runs at App level to ensure DM updates happen EVERYWHERE instantly
 * - Updates conversation list when ANY message arrives
 * - Plays notification sounds for messages from other users
 * - Ensures receiver sees messages instantly without refresh
 * - Includes deduplication and retry logic for reliability
 */

import { useEffect, useRef, useCallback, useState, startTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { callSounds } from '@/lib/callSounds';
import { removeChannelByTopic, removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { scheduleIdleWork } from '@/lib/scheduleIdleWork';

// Track the current conversation globally with a tiny pub/sub so React
// effects can react to changes (a plain module variable did not trigger
// re-subscription of the broadcast channel when the user opened a DM).
let currentConversationId: string | null = null;
const currentConversationListeners = new Set<(id: string | null) => void>();

export function setCurrentConversationId(id: string | null) {
  if (currentConversationId === id) return;
  currentConversationId = id;
  currentConversationListeners.forEach(l => {
    try { l(id); } catch { /* noop */ }
  });
}

function subscribeCurrentConversationId(listener: (id: string | null) => void) {
  currentConversationListeners.add(listener);
  return () => { currentConversationListeners.delete(listener); };
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

function optimisticDedupeKey(conversationId: string, content: string | null | undefined) {
  return `${conversationId}:${(content || '').trim().slice(0, 50)}`;
}

export function registerOptimisticMessage(conversationId: string, content: string, senderId: string) {
  const key = optimisticDedupeKey(conversationId, content);
  pendingOptimisticMessages.set(key, { content, senderId, timestamp: Date.now() });

  // Auto-cleanup after 10 seconds
  setTimeout(() => pendingOptimisticMessages.delete(key), 10000);
}

function isOptimisticDuplicate(conversationId: string, content: string, _senderId: string): boolean {
  const key = optimisticDedupeKey(conversationId, content);
  const pending = pendingOptimisticMessages.get(key);
  if (pending && Date.now() - pending.timestamp < 5000) {
    pendingOptimisticMessages.delete(key);
    return true;
  }
  return false;
}

function matchesOwnOptimisticTemp(
  message: { id?: string; sender_id?: string; content?: string | null },
  serverRow: { sender_id?: string; content?: string | null },
  profileId: string | null,
  authUid: string | null,
): boolean {
  if (typeof message.id !== 'string' || !message.id.startsWith('temp-')) return false;

  const senderMatches =
    message.sender_id === serverRow.sender_id ||
    (!!profileId && message.sender_id === profileId) ||
    (!!authUid && message.sender_id === authUid);
  if (!senderMatches) return false;

  return (message.content || '').trim() === (serverRow.content || '').trim();
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
  }, 800);
}

function isPresenceOnline(isOnline: boolean | undefined, lastSeenAt: string | undefined): boolean {
  if (!isOnline) return false;
  if (!lastSeenAt) return true;
  return Date.now() - new Date(lastSeenAt).getTime() <= 90_000;
}

/** Patch batch presence maps in-place — never invalidate (that refetched the whole DM list). */
function patchUsersPresenceCache(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  isOnline: boolean,
  lastSeenAt: string,
) {
  const nextOnline = isPresenceOnline(isOnline, lastSeenAt);
  qc.setQueriesData<Record<string, boolean>>(
    { queryKey: ['users-presence'] },
    (old) => {
      if (!old || typeof old !== 'object') return old;
      if (!(userId in old)) return old;
      if (old[userId] === nextOnline) return old;
      return { ...old, [userId]: nextOnline };
    },
  );
}

export function useGlobalRealtimeMessages() {
  const { profile, user } = useAuth();
  const profileId = getEffectiveProfileId(profile?.id);
  const authUid = user?.id ?? profile?.user_id ?? null;
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setupGenerationRef = useRef(0);

  const setupChannel = useCallback(async () => {
    if (!profileId) return;
    const generation = ++setupGenerationRef.current;
    const channelName = `global-messages:${profileId}`;

    removeRealtimeChannel(channelRef.current);
    channelRef.current = null;
    removeChannelByTopic(channelName);

    // Ensure the Realtime socket carries the current JWT so RLS-filtered
    // postgres_changes events (e.g. messages INSERT) actually reach us.
    try {
      const { data: { session } } = await db.auth.getSession();
      if (session?.access_token) {
        db.realtime.setAuth(session.access_token);
        if (import.meta.env.DEV) console.log('[GlobalRT] setAuth applied');
      }
    } catch (e) {
      if (import.meta.env.DEV) console.warn('[GlobalRT] setAuth failed', e);
    }

    if (generation !== setupGenerationRef.current) return;

    const channel = subscribePostgresChannel(channelName, [
      {
        event: 'INSERT',
        table: 'messages',
        callback: async (payload) => {
          try {
          const newMessage = payload.new as any;
          const conversationId = newMessage.conversation_id;
          const isFromCurrentUser =
            newMessage.sender_id === profileId ||
            (!!authUid && newMessage.sender_id === authUid);
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

          const skipReceiverInsert =
            isFromCurrentUser &&
            isOptimisticDuplicate(conversationId, newMessage.content, newMessage.sender_id);

          // Sender viewing this chat: always pin the real server row (replaces temp-* bubble).
          if (isFromCurrentUser && isViewingConvo) {
            queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
              const row = {
                ...newMessage,
                views: [],
                reactions: [],
              };
              if (!old?.length) return [row];
              const stripped = old.filter(
                (m) => !matchesOwnOptimisticTemp(m, newMessage, profileId, authUid),
              );
              if (stripped.some((m) => m.id === newMessage.id)) return stripped;
              return [...stripped, row];
            });
          }

          if (skipReceiverInsert) {
            if (import.meta.env.DEV) console.log('[GlobalRT] Skipping optimistic duplicate for sender');
          } else if (!isFromCurrentUser) {
            // Try to get sender from cached conversation members first
            let sender: any = null;
            const cachedConvos = queryClient.getQueryData<any[]>(['dm-conversations', profileId]) || 
                                 queryClient.getQueryData<any[]>(['conversations', profileId]);
            
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
              const { data: fetchedSender } = await db
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
          startTransition(() => {
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
              const aIsPinned = a.members?.find((m: any) => m.user_id === profileId)?.is_pinned;
              const bIsPinned = b.members?.find((m: any) => m.user_id === profileId)?.is_pinned;
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
          queryClient.setQueryData<any[]>(['conversations', profileId], updateConversations);
          queryClient.setQueryData<any[]>(['dm-conversations', profileId], updateConversations);

          // Only invalidate when the conversation is genuinely new to the cache.
          const cached = queryClient.getQueryData<any[]>(['dm-conversations', profileId]);
          if (cached && !cached.some(c => c.id === conversationId)) {
            scheduleUnknownConvoRefetch(queryClient, profileId);
          }
          });
          } catch (err) {
            if (import.meta.env.DEV) console.warn('[GlobalRT] INSERT handler failed', err);
          }
        },
      },
      {
        event: 'UPDATE',
        table: 'messages',
        callback: (payload) => {
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
            scheduleUnknownConvoRefetch(queryClient, profileId);
          }
        },
      },
      {
        event: 'DELETE',
        table: 'messages',
        callback: (payload) => {
          const deletedMessage = payload.old as any;
          const conversationId = deletedMessage.conversation_id;

          if (!conversationId) return;

          // Remove from cache regardless of which conversation is being viewed
          queryClient.setQueryData<any[]>(['messages', conversationId], (old) => {
            if (!old) return old;
            return old.filter(m => m.id !== deletedMessage.id);
          });

          // Update conversation list (debounced + scoped)
          scheduleUnknownConvoRefetch(queryClient, profileId);
        },
      },
    ], (status) => {
        if (import.meta.env.DEV) console.log('[GlobalRT] Subscription status:', status);
        if (status === 'SUBSCRIBED') {
          if (import.meta.env.DEV) console.log('[GlobalRT] ✅ Global realtime connected for user:', profileId);
          retryCount = 0;
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[GlobalRT] ❌ Channel error - will retry');
          
          if (retryCount < MAX_RETRIES) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
            retryCount++;
            if (import.meta.env.DEV) console.log(`[GlobalRT] Retrying in ${delay}ms (attempt ${retryCount}/${MAX_RETRIES})`);
            
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = setTimeout(() => {
              removeRealtimeChannel(channelRef.current);
              channelRef.current = null;
              removeChannelByTopic(channelName);
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

    if (generation !== setupGenerationRef.current) {
      removeRealtimeChannel(channel);
      return;
    }

    channelRef.current = channel;
  }, [profileId, queryClient]);

  // Global presence channel — patches ['user-presence', id] and
  // ['users-presence', ...] caches as soon as anyone toggles online/offline,
  // so the DM list reflects status in near-realtime instead of waiting 20s.
  const presenceChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  useEffect(() => {
    if (!profileId) return;
    removeRealtimeChannel(presenceChannelRef.current);
    presenceChannelRef.current = null;
    removeChannelByTopic(`global-presence:${profileId}`);

    const ch = subscribePostgresChannel(`global-presence:${profileId}`, [
      {
        event: '*',
        table: 'user_presence',
        callback: (payload: any) => {
          const row = payload.new || payload.old;
          if (!row?.user_id) return;
          queryClient.setQueryData(['user-presence', row.user_id], {
            is_online: row.is_online,
            last_seen_at: row.last_seen_at,
          });
          patchUsersPresenceCache(
            queryClient,
            row.user_id,
            row.is_online,
            row.last_seen_at,
          );
        },
      },
    ]);
    presenceChannelRef.current = ch;
    return () => {
      try {
        removeRealtimeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      } catch { /* never throw from cleanup */ }
    };
  }, [profileId, queryClient]);

  // Broadcast listener for instant delivery on the currently viewed conversation
  const broadcastChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const [activeConvoId, setActiveConvoId] = useState<string | null>(currentConversationId);

  useEffect(() => {
    return subscribeCurrentConversationId(setActiveConvoId);
  }, []);

  useEffect(() => {
    if (!profileId || !activeConvoId) {
      removeRealtimeChannel(broadcastChannelRef.current);
      broadcastChannelRef.current = null;
      return;
    }

    const convoId = activeConvoId;
    removeChannelByTopic(`dm-broadcast:${convoId}`);

    const bc = db
      .channel(`dm-broadcast:${convoId}`)
      .on('broadcast', { event: 'new-message' }, (payload: any) => {
        const msg = payload.payload?.message;
        if (!msg || msg.sender_id === profileId) return; // skip own messages
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
      try {
        removeRealtimeChannel(bc);
      } catch { /* noop */ }
      broadcastChannelRef.current = null;
    };
  }, [profileId, queryClient, activeConvoId]);

  useEffect(() => {
    if (!profileId) return;
    return scheduleIdleWork(() => {
      void setupChannel();
    }, 1200);
  }, [setupChannel, profileId]);

  useEffect(() => {
    return () => {
      setupGenerationRef.current += 1;
      try {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = null;
        }
        if (channelRef.current) {
          if (import.meta.env.DEV) console.log('[GlobalRT] Cleaning up global channel');
          removeRealtimeChannel(channelRef.current);
          channelRef.current = null;
        }
        if (profileId) {
          removeChannelByTopic(`global-messages:${profileId}`);
        }
        removeRealtimeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      } catch { /* never throw from cleanup */ }
    };
  }, [profileId]);
}
