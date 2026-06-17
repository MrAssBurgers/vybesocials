import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { shouldRefetchWhenEmpty, refetchListOnMount } from '@/lib/queryRefetchPolicy';
import { toast } from 'sonner';
import { callSounds } from '@/lib/callSounds';
import { enqueue as outboxEnqueue } from '@/lib/dmOutbox';

export type ViewMode = 'view_once' | '24h' | 'permanent';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  message_type: string;
  view_mode: ViewMode;
  expires_at: string | null;
  is_deleted: boolean;
  is_edited?: boolean;
  edited_at?: string | null;
  reply_to_id: string | null;
  created_at: string;
  saved_by_sender?: boolean | null;
  saved_by_recipient?: boolean | null;
  saved_at?: string | null;
  viewed_at?: string | null;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  views?: { user_id: string; viewed_at: string }[];
  reactions?: { user_id: string; emoji: string }[];
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  members?: {
    user_id: string;
    role: string;
    is_muted: boolean;
    is_pinned: boolean;
    last_read_at: string | null;
    profile?: {
      id: string;
      username: string;
      avatar_url: string | null;
      display_name: string | null;
    };
  }[];
  last_message?: Message | null;
  unread_count?: number;
}

// Hook to get total unread message count across all conversations
export function useUnreadMessagesCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['unread-messages-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      // Get conversations the user is part of
      const { data: memberships } = await db
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', profileId);

      if (!memberships?.length) return 0;

      let totalUnread = 0;
      for (const membership of memberships) {
        const lastReadAt = membership.last_read_at || '1970-01-01';
        const { count } = await db
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', membership.conversation_id)
          .neq('sender_id', profileId)
          .gt('created_at', lastReadAt)
          .eq('is_deleted', false);

        totalUnread += count || 0;
      }

      return totalUnread;
    },
    enabled: !!profileId,
    staleTime: 30000, // 30 seconds - faster updates for badge sync
    refetchInterval: 60000, // Check every minute
    refetchOnWindowFocus: true, // Ensure fresh count when user returns
  });
}

export function useConversations() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // Fetch hidden conversations and conversations in parallel
      // First get the conversation IDs the user is a member of
      const { data: membershipData, error: membershipError } = await db
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profileId);
      
      if (membershipError) throw membershipError;
      if (!membershipData?.length) return [];
      
      const userConversationIds = membershipData.map(m => m.conversation_id);

      const [hiddenResult, conversationsResult] = await Promise.all([
        db
          .from('hidden_conversations')
          .select('conversation_id')
          .eq('user_id', profileId),
        db
          .from('conversations')
          .select(`
            *,
            members:conversation_members(
              user_id,
              role,
              is_muted,
              is_pinned,
              last_read_at,
              profile:profiles(id, user_id, username, avatar_url, display_name)
            )
          `)
          .in('id', userConversationIds)
          .order('updated_at', { ascending: false }),
      ]);

      const hiddenIds = new Set((hiddenResult.data || []).map(h => h.conversation_id));
      
      if (conversationsResult.error) throw conversationsResult.error;
      if (!conversationsResult.data?.length) return [];

      // Filter out hidden conversations (unless there's a new message - handled below)
      const conversations = conversationsResult.data.filter(c => !hiddenIds.has(c.id));

      // Batch fetch last messages for all conversations
      const convIds = conversations.map(c => c.id);
      const { data: allMessages } = await db
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false });

      // Group messages by conversation and get the latest one
      const lastMessageMap = new Map<string, any>();
      (allMessages || []).forEach(msg => {
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      });

      // Check if any hidden conversations have new messages - unhide them
      const hiddenConvsWithNewMessages = conversationsResult.data.filter(c => {
        if (!hiddenIds.has(c.id)) return false;
        const memberRecord = c.members?.find((m: any) => m.user_id === profileId);
        const hiddenAt = hiddenResult.data?.find(h => h.conversation_id === c.id);
        // If there's a message after the conversation was hidden, show it
        const lastMsg = (allMessages || []).find(msg => msg.conversation_id === c.id);
        if (lastMsg && hiddenAt) {
          // Note: We'd need hidden_at timestamp to properly check this
          // For now, we show if there's any unread message
          const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
          return lastMsg.sender_id !== profileId && lastMsg.created_at > lastReadAt;
        }
        return false;
      });

      // Add back conversations with new messages
      const finalConversations = [...conversations, ...hiddenConvsWithNewMessages];

      // Build final result with unread counts
      const result = finalConversations.map(conv => {
        const memberRecord = conv.members?.find((m: any) => m.user_id === profileId);
        const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
        
        // Count unread from cached messages
        const unreadCount = (allMessages || []).filter(
          msg => msg.conversation_id === conv.id && 
                 msg.sender_id !== profileId && 
                 msg.created_at > lastReadAt
        ).length;

        const lastMessage = lastMessageMap.get(conv.id) || null;

        return {
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount,
          // Add sort key for proper ordering by last message time
          _sortTime: lastMessage?.created_at || conv.updated_at,
        };
      });

      // Sort by last message time (most recent first)
      result.sort((a, b) => {
        const timeA = new Date(a._sortTime).getTime();
        const timeB = new Date(b._sortTime).getTime();
        return timeB - timeA;
      });

      return result as Conversation[];
    },
    enabled: !!profileId,
    staleTime: 60000, // 1 minute cache
    gcTime: 1000 * 60 * 60 * 24, // 24h — keep conversations cached for offline
    refetchOnWindowFocus: true, // Refetch when user returns to app
    refetchOnMount: refetchListOnMount,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    networkMode: 'online',
  });

  // Realtime updates are now handled by useGlobalRealtimeMessages at App level
  // This prevents duplicate subscriptions and ensures consistent updates

  return query;
}

const MESSAGE_SELECT_SLIM = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name),
  views:message_views(user_id, viewed_at),
  reactions:message_reactions(user_id, emoji)
`;

function filterMessagesForViewer(messages: Message[], viewerId?: string): Message[] {
  return messages.filter((msg) => {
    if (msg.view_mode === 'view_once' && msg.media_type !== 'vybe' && msg.sender_id !== viewerId) {
      const hasViewed = msg.views?.some((v) => v.user_id === viewerId);
      if (hasViewed) return false;
    }
    if (msg.expires_at && new Date(msg.expires_at) < new Date()) {
      return false;
    }
    return true;
  });
}

function mergePendingOptimisticMessages(
  queryClient: QueryClient,
  conversationId: string,
  filtered: Message[],
): Message[] {
  const existing = queryClient.getQueryData<Message[]>(['messages', conversationId]) || [];
  const serverIds = new Set(filtered.map((m) => m.id));
  const pendingTemps = existing.filter(
    (m) => typeof m.id === 'string' && m.id.startsWith('temp-') && !serverIds.has(m.id),
  );
  return [...filtered, ...pendingTemps];
}

export function useMessages(conversationId: string | undefined) {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const viewerId = (await resolveSessionProfileId(profileId)) ?? profileId;

      const { data, error } = await db
        .from('messages')
        .select(MESSAGE_SELECT_SLIM)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      if (data) data.reverse();

      const filtered = filterMessagesForViewer((data || []) as Message[], viewerId);
      return mergePendingOptimisticMessages(queryClient, conversationId, filtered);
    },
    enabled: !!conversationId,
    staleTime: 30000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => shouldRefetchWhenEmpty(query),
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    // Must reach network on first open — global offlineFirst can pause forever with empty cache.
    networkMode: 'always',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Realtime is now handled by useGlobalRealtimeMessages at the App level
  // This ensures instant updates without duplicate subscriptions

  return query;
}

export function useSendMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      content,
      mediaUrl,
      mediaType,
      viewMode = 'permanent',
      replyToId,
    }: {
      conversationId: string;
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
      viewMode?: ViewMode;
      replyToId?: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      try {
        const { data, error } = await db
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: profile.id,
            content,
            media_url: mediaUrl,
            media_type: mediaType,
            view_mode: viewMode,
            expires_at: expiresAt,
            reply_to_id: replyToId,
          })
          .select()
          .single();

        if (error) throw error;

        // Update conversation updated_at
        await db
          .from('conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId);

        return data;
      } catch (err: any) {
        const msg = (err?.message || '').toLowerCase();
        const isNetwork =
          (typeof navigator !== 'undefined' && navigator.onLine === false) ||
          /network|failed to fetch|timeout|fetch/.test(msg);
        if (isNetwork) {
          // Queue for automatic delivery when we reconnect.
          await outboxEnqueue({
            tempId: `out-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conversationId,
            senderId: profile.id,
            content,
            mediaUrl,
            mediaType,
            viewMode,
            replyToId,
            expiresAt,
          });
          // Return a synthetic record so onSuccess fires and UI stays smooth.
          return {
            id: `queued-${Date.now()}`,
            conversation_id: conversationId,
            sender_id: profile.id,
            content: content ?? null,
            media_url: mediaUrl ?? null,
            media_type: mediaType ?? null,
            view_mode: viewMode,
            expires_at: expiresAt,
            reply_to_id: replyToId ?? null,
            created_at: new Date().toISOString(),
            is_deleted: false,
            _queued: true,
          } as any;
        }
        throw err;
      }
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      invalidateConversationCaches(queryClient);

      if ((data as { _queued?: boolean })?._queued) {
        toast.info('Message queued — will send when you\'re back online', { duration: 3500 });
      }

      // Push notifications are sent server-side by Firestore triggers
      // (`onDmMessageCreated` / `onCallCreated` Cloud Functions).
    },
  });
}

export function useUnsendMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Get the message to verify ownership and get conversation_id
      const { data: message, error: fetchError } = await db
        .from('messages')
        .select('sender_id, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');
      
      // sender_id in messages table IS profile.id (not user_id)
      if (message.sender_id !== profile.id) {
        throw new Error('You can only unsend your own messages');
      }

      // Soft delete the message - RLS will verify ownership
      const { error } = await db
        .from('messages')
        .update({ 
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;

      return message.conversation_id;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      invalidateConversationCaches(queryClient);
      toast.success('Message unsent');
    },
    onError: (error: any) => {
      console.error('Failed to unsend message:', error);
      toast.error(error?.message || 'Failed to unsend message');
    },
  });
}

export function useMarkMessageViewed() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('message_views')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
        }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });
}

/**
 * Toggle saved (kept) state on a 1:1 DM message.
 * Saved messages are exempt from the 48h auto-expiry; both users see the saved state.
 */
export function useToggleSavedMessage(conversationId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    // Optimistic flip so the badge animates instantly — never wait on RPC.
    onMutate: async (messageId: string) => {
      if (!conversationId) return;
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const previous = queryClient.getQueryData<Message[]>(['messages', conversationId]);
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map((m) => {
          if (m.id !== messageId) return m;
          const wasSaved = !!(m.saved_by_sender || m.saved_by_recipient);
          // Toggle whichever side was set; if neither, set sender side as a sensible default
          // (server RPC will replace these values with the authoritative result).
          const nextSender = wasSaved ? false : (m.saved_by_sender ? false : true);
          const nextRecipient = wasSaved ? false : !!m.saved_by_recipient;
          return {
            ...m,
            saved_by_sender: nextSender,
            saved_by_recipient: nextRecipient,
            saved_at: !wasSaved ? new Date().toISOString() : null,
          };
        });
      });
      return { previous };
    },
    mutationFn: async (messageId: string) => {
      const { data, error } = await db.rpc('toggle_message_saved', { _message_id: messageId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return { messageId, ...(row as any) };
    },
    onSuccess: ({ messageId, saved_by_sender, saved_by_recipient, saved_at, expires_at }) => {
      if (!conversationId) return;
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.id === messageId
            ? { ...m, saved_by_sender, saved_by_recipient, saved_at, expires_at }
            : m,
        );
      });
    },
    onError: (err: any, _messageId, context: any) => {
      // Roll back optimistic UI on real failure
      if (conversationId && context?.previous) {
        queryClient.setQueryData(['messages', conversationId], context.previous);
      }
      // Harmless RPC raises (race conditions, message not yet loaded, group quirks)
      // stay silent — Snapchat behavior. Only show toast for actual network/server errors.
      const msg = String(err?.message || '').toLowerCase();
      const silent =
        msg.includes('message not found') ||
        msg.includes('not a participant') ||
        msg.includes('no profile') ||
        msg.includes('auth required');
      if (silent) return;
      if (err?.status >= 500 || msg.includes('network') || msg.includes('failed to fetch')) {
        toast.error('Could not update saved state');
      }
    },
  });
}

export function useCreateConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memberIds,
      isGroup = false,
      name,
    }: {
      memberIds: string[];
      isGroup?: boolean;
      name?: string;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // For 1:1 DMs, use the atomic RPC function
      if (!isGroup && memberIds.length === 1) {
        const otherUserId = memberIds[0];
        
        const { data: conversationId, error: rpcError } = await db
          .rpc('create_dm_conversation', { other_profile_id: otherUserId });

        if (rpcError) {
          console.error('create_dm_conversation RPC error:', rpcError);
          throw new Error(rpcError.message || 'Failed to start conversation');
        }

        // Fetch the full conversation object to return
        const { data: conv, error: fetchError } = await db
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .single();

        if (fetchError || !conv) {
          throw new Error('Conversation created but could not be fetched');
        }

        return conv;
      }

      // For group chats, use the existing multi-step approach
      const { data: conversation, error: convError } = await db
        .from('conversations')
        .insert({
          is_group: isGroup,
          name: isGroup ? name : null,
          created_by: profile.id,
        })
        .select()
        .single();

      if (convError) throw convError;

      const allMemberIds = [...new Set([profile.id, ...memberIds])];
      const membersToInsert = allMemberIds.map((userId) => ({
        conversation_id: conversation.id,
        user_id: userId,
        role: userId === profile.id ? 'admin' : 'member',
      }));

      const { error: membersError } = await db
        .from('conversation_members')
        .insert(membersToInsert);

      if (membersError) {
        await db.from('conversations').delete().eq('id', conversation.id);
        throw membersError;
      }

      return conversation;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient);
    },
    onError: (error: any) => {
      console.error('Failed to create conversation:', error);
      const msg = error?.message || 'Failed to start conversation';
      toast.error(msg);
    },
  });
}

export function useTypingIndicator(conversationId: string | undefined) {
  const { profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !profile?.id) return;

    if (isTyping) {
      // Use upsert with onConflict to handle race conditions
      await db
        .from('typing_indicators')
        .upsert(
          {
            conversation_id: conversationId,
            user_id: profile.id,
            started_at: new Date().toISOString(),
          },
          { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
        );
    } else {
      await db
        .from('typing_indicators')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);
    }
  }, [conversationId, profile?.id]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = subscribePostgresChannel(`typing:${conversationId}`, [
      {
        event: '*',
        table: 'typing_indicators',
        filter: `conversation_id=eq.${conversationId}`,
        callback: async () => {
          const { data } = await db
            .from('typing_indicators')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', profile?.id || '')
            .gt('started_at', new Date(Date.now() - 5000).toISOString());

          setTypingUsers(data?.map((t) => t.user_id) || []);
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [conversationId, profile?.id]);

  return { typingUsers, setTyping };
}

type CaptureType = 'screenshot' | 'screen_recording_start' | 'screen_recording_stop' | 'possible_recording';

export function useScreenshotNotification(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [screenshotEvents, setScreenshotEvents] = useState<{ id: string; username: string; timestamp: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  const notifyCapture = useCallback(async (captureType: CaptureType) => {
    console.log('[Capture] notifyCapture called, type:', captureType, 'conversationId:', conversationId);
    
    if (!conversationId || !profile?.id) {
      console.log('[Capture] Missing conversationId or profile');
      return;
    }

    // Determine message content based on capture type
    let content: string;
    let messageType: string;
    switch (captureType) {
      case 'screenshot':
        content = '📸 took a screenshot';
        messageType = 'screenshot_notification';
        break;
      case 'screen_recording_start':
        content = '🎥 started screen recording';
        messageType = 'screen_recording_notification';
        setIsRecording(true);
        break;
      case 'screen_recording_stop':
        content = '🎥 stopped screen recording';
        messageType = 'screen_recording_notification';
        setIsRecording(false);
        break;
      case 'possible_recording':
        content = '🎥 possible screen recording detected';
        messageType = 'screen_recording_notification';
        break;
      default:
        return;
    }

    try {
      // For screenshots, also insert into screenshot_notifications table
      if (captureType === 'screenshot') {
        console.log('[Capture] Inserting to screenshot_notifications table...');
        const { error } = await db
          .from('screenshot_notifications')
          .insert({
            conversation_id: conversationId,
            user_id: profile.id,
          });

        if (error) {
          console.error('[Capture] Failed to record screenshot:', error);
        } else {
          console.log('[Capture] Screenshot notification recorded successfully');
        }
      }

      // Insert system message so it shows in chat history
      console.log('[Capture] Inserting system message...');
      const { error: msgError } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
          message_type: messageType,
        });

      if (msgError) {
        console.error('[Capture] Failed to insert system message:', msgError);
      } else {
        console.log('[Capture] System message inserted successfully');
      }
      
      // Invalidate messages to show the new system message
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    } catch (err) {
      console.error('[Capture] Capture notification error:', err);
    }
  }, [conversationId, profile?.id, queryClient]);

  // Convenience wrapper for screenshot (backward compatible)
  const notifyScreenshot = useCallback(() => notifyCapture('screenshot'), [notifyCapture]);

  // Listen for screenshot notifications in real-time
  useEffect(() => {
    if (!conversationId) return;

    const channel = subscribePostgresChannel(`screenshots:${conversationId}`, [
      {
        event: 'INSERT',
        table: 'screenshot_notifications',
        filter: `conversation_id=eq.${conversationId}`,
        callback: async (payload) => {
          if ((payload.new as any).user_id !== profile?.id) {
            const { data: user } = await db
              .from('profiles')
              .select('username')
              .eq('id', (payload.new as any).user_id)
              .single();

            const username = user?.username || 'Someone';
            
            // Show toast notification
            toast.warning(`📸 ${username} took a screenshot!`, {
              icon: '📸',
              duration: 5000,
            });
            
            // Add to local events for in-chat display
            setScreenshotEvents(prev => [...prev, {
              id: (payload.new as any).id,
              username,
              timestamp: (payload.new as any).created_at,
            }]);
          }
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [conversationId, profile?.id]);

  // Clear old screenshot events after they've been displayed
  useEffect(() => {
    if (screenshotEvents.length === 0) return;
    
    const timer = setTimeout(() => {
      // Remove events older than 10 seconds from local state
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      setScreenshotEvents(prev => prev.filter(e => e.timestamp > tenSecondsAgo));
    }, 10000);
    
    return () => clearTimeout(timer);
  }, [screenshotEvents]);

  return { notifyScreenshot, notifyCapture, screenshotEvents, isRecording };
}

export function useStreaks() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['streaks', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await db
        .from('streaks')
        .select(`
          *,
          user1:profiles!user1_id(id, username, avatar_url, display_name),
          user2:profiles!user2_id(id, username, avatar_url, display_name)
        `)
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .gt('expires_at', new Date().toISOString())
        .order('streak_count', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });
}

export function useAddReaction() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Toggle: if user already reacted with same emoji, remove it.
      // Otherwise upsert (one reaction per user per message).
      const { data: existing } = await db
        .from('message_reactions')
        .select('emoji')
        .eq('message_id', messageId)
        .eq('user_id', profile.id)
        .maybeSingle();

      // Always clear any existing reaction from this user on this message first
      await db
        .from('message_reactions')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profile.id);

      if (existing?.emoji === emoji) {
        // Toggle off — already deleted above
        return { messageId, emoji, removed: true };
      }

      const { error: insertError } = await db
        .from('message_reactions')
        .insert({ message_id: messageId, user_id: profile.id, emoji });
      if (insertError) throw insertError;
      return { messageId, emoji, removed: false };
    },
    // Optimistic update: patch the message reactions array in cache immediately,
    // preserving message ordering. Realtime channel will reconcile.
    onMutate: async ({ messageId, emoji }) => {
      if (!profile?.id) return;
      const userId = profile.id;

      // Cancel in-flight refetches so they don't overwrite our optimistic state
      await queryClient.cancelQueries({ queryKey: ['messages'] });

      // Snapshot all messages caches so we can roll back on error
      const snapshots: Array<[readonly unknown[], Message[] | undefined]> = [];
      const queries = queryClient.getQueriesData<Message[]>({ queryKey: ['messages'] });

      for (const [key, messages] of queries) {
        if (!messages) continue;
        snapshots.push([key, messages]);
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) continue;

        const target = messages[idx];
        const existing = target.reactions?.find(r => r.user_id === userId);
        let nextReactions = target.reactions ? [...target.reactions] : [];

        if (existing?.emoji === emoji) {
          // Toggle off
          nextReactions = nextReactions.filter(r => r.user_id !== userId);
        } else if (existing) {
          // Replace
          nextReactions = nextReactions.map(r =>
            r.user_id === userId ? { ...r, emoji } : r
          );
        } else {
          // Add
          nextReactions.push({ user_id: userId, emoji });
        }

        // Replace in place — preserves array order (no reordering of messages)
        const updated = [...messages];
        updated[idx] = { ...target, reactions: nextReactions };
        queryClient.setQueryData<Message[]>(key, updated);
      }

      return { snapshots };
    },
    onError: (_err, _vars, context) => {
      // Roll back optimistic updates
      context?.snapshots?.forEach(([key, snapshot]) => {
        queryClient.setQueryData(key, snapshot);
      });
    },
    // No onSuccess invalidate — realtime message_reactions channel reconciles
  });
}

// Mark all messages in a conversation as read
export function useMarkConversationRead() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
    },
  });
}

// Find conversation with a specific user and mark it as read
export function useMarkConversationReadByUser() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (targetUserId: string) => {
      if (!profile?.id || profile.id === targetUserId) return;

      // Find the 1:1 conversation with this user
      const { data: myMemberships } = await db
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id);

      if (!myMemberships?.length) return;

      const conversationIds = myMemberships.map(m => m.conversation_id);

      // Find conversations where the target user is also a member AND it's a 1:1 (not group)
      const { data: targetMemberships } = await db
        .from('conversation_members')
        .select(`
          conversation_id,
          conversations!inner(id, is_group)
        `)
        .eq('user_id', targetUserId)
        .in('conversation_id', conversationIds);

      // Filter to only 1:1 conversations
      const dmConversations = targetMemberships?.filter(
        m => (m.conversations as any)?.is_group === false
      ) || [];

      if (dmConversations.length === 0) return;

      // Mark the first (most recent) DM conversation as read
      const conversationId = dmConversations[0].conversation_id;

      const { error } = await db
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient);
      queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
    },
  });
}

/**
 * Mark a vybe (media message) as viewed - stores viewed_at timestamp
 * This prevents re-opening viewed vybes after refresh
 */
export function useMarkVybeViewed() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
        .from('messages')
        .update({ viewed_at: new Date().toISOString() })
        .eq('id', messageId);

      if (error) throw error;
      return messageId;
    },
    onSuccess: (messageId) => {
      // Update the local cache to reflect viewed state
      queryClient.setQueriesData<Message[]>({ queryKey: ['messages'] }, (old) => {
        if (!old) return old;
        return old.map(msg => 
          msg.id === messageId ? { ...msg, viewed_at: new Date().toISOString() } : msg
        );
      });
    },
  });
}
