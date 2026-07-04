import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { fetchMessagesForConversations } from '@/lib/conversationMessagesQuery';
import { messagesQueryKey, readMessagesCache, mergeMessagesWithLocalCache, patchMessagesCache, normalizeMessagesCache } from '@/lib/messagesQueryKey';
import { safeDmMembers, ensureArray } from '@/lib/persistedCollections';
import { applyMessageSaveToggle } from '@/lib/messageSaveToggle';
import { loadConversationMessages } from '@/lib/loadConversationMessages';
import { CHAT_INITIAL_MESSAGE_LIMIT } from '@/lib/conversationMessagesQuery';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { shouldRefetchWhenEmpty, refetchListOnMount } from '@/lib/queryRefetchPolicy';
import { toast } from 'sonner';
import { callSounds } from '@/lib/callSounds';
import { normalizeToProfileId, ensureConversationReady } from '@/lib/dmMembershipRepair';
import { createDmChat } from '@/lib/firebase/chats';
import { firebaseAuth } from '@/lib/firebase/authService';
import { getDmConversationSortTime, patchDmConversationActivity, sortDmConversations } from '@/lib/dmConversationSort';
import {
  prewarmDmBroadcastChannel,
  sendDmBroadcastScreenshot,
  subscribeDmBroadcastScreenshot,
  type DmScreenshotPayload,
} from '@/lib/dmBroadcast';
import { haptics } from '@/lib/haptics';

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
  /** After first Vybe view + one hold-replay, snap can never reopen. */
  vybe_replay_exhausted?: boolean;
  /** Stable React key while optimistic temp id is swapped for server id. */
  _clientKey?: string;
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

      const { data: { session } } = await db.auth.getSession();
      const authUid = session?.user?.id ?? null;

      const membershipQueries = [
        db
          .from('conversation_members')
          .select('conversation_id, last_read_at')
          .eq('user_id', profileId),
      ];
      if (authUid && authUid !== profileId) {
        membershipQueries.push(
          db
            .from('conversation_members')
            .select('conversation_id, last_read_at')
            .eq('user_id', authUid),
        );
      }

      const membershipResults = await Promise.all(membershipQueries);
      const membershipRows = membershipResults.flatMap((r) => r.data || []);
      if (!membershipRows.length) return 0;

      const lastReadByConv = new Map<string, string>();
      for (const row of membershipRows) {
        const cid = String(row.conversation_id);
        const ts = row.last_read_at || '1970-01-01';
        const prev = lastReadByConv.get(cid);
        if (!prev || ts > prev) lastReadByConv.set(cid, ts);
      }

      let totalUnread = 0;
      for (const [conversationId, lastReadAt] of lastReadByConv) {
        const { data: messageRows } = await db
          .from('messages')
          .select('id, sender_id, created_at, is_deleted')
          .eq('conversation_id', conversationId)
          .limit(200);

        totalUnread += (messageRows || []).filter(
          (m: { sender_id?: string; created_at?: string; is_deleted?: boolean }) =>
            !m.is_deleted &&
            m.sender_id !== profileId &&
            m.sender_id !== authUid &&
            (m.created_at || '') > lastReadAt,
        ).length;
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
      const { data: allMessages, error: messagesBatchError } = await fetchMessagesForConversations(
        convIds,
        '*',
        Math.min(Math.max(convIds.length * 5, 100), 500),
      );
      if (messagesBatchError) {
        console.warn('[Conversations] messages batch query failed:', messagesBatchError.message);
      }
      const sortedMessages = [...(allMessages || [])].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );

      // Group messages by conversation and get the latest one
      const lastMessageMap = new Map<string, any>();
      (sortedMessages || []).forEach(msg => {
        if (msg.is_deleted) return;
        if (!lastMessageMap.has(msg.conversation_id)) {
          lastMessageMap.set(msg.conversation_id, msg);
        }
      });

      // Check if any hidden conversations have new messages - unhide them
      const hiddenConvsWithNewMessages = conversationsResult.data.filter(c => {
        if (!hiddenIds.has(c.id)) return false;
        const memberRecord = safeDmMembers(c.members).find((m: any) => m.user_id === profileId);
        const hiddenAt = hiddenResult.data?.find(h => h.conversation_id === c.id);
        // If there's a message after the conversation was hidden, show it
        const lastMsg = (sortedMessages || []).find(msg => msg.conversation_id === c.id);
        if (lastMsg && hiddenAt) {
          // Note: We'd need hidden_at timestamp to properly check this
          // For now, we show if there's any unread message
          const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
          return (lastMsg as any).sender_id !== profileId && lastMsg.created_at > lastReadAt;
        }
        return false;
      });

      // Add back conversations with new messages
      const finalConversations = [...conversations, ...hiddenConvsWithNewMessages];

      // Build final result with unread counts
      const result = finalConversations.map(conv => {
        const memberRecord = safeDmMembers(conv.members).find((m: any) => m.user_id === profileId);
        const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
        
        // Count unread from cached messages
        const unreadCount = (sortedMessages || []).filter(
          msg => msg.conversation_id === conv.id && 
                 !msg.is_deleted &&
                 (msg as any).sender_id !== profileId && 
                 msg.created_at > lastReadAt
        ).length;

        const lastMessage = lastMessageMap.get(conv.id) || null;

        return {
          ...conv,
          last_message: lastMessage,
          unread_count: unreadCount,
          _sortTime: getDmConversationSortTime({
            ...conv,
            last_message: lastMessage,
          } as Conversation & { _sortTime?: string }),
        };
      });

      return sortDmConversations(result, profileId) as Conversation[];
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

export function useMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const actorId = profileId ?? profile?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: messagesQueryKey(conversationId),
    queryFn: async () => {
      if (!conversationId) return [];
      try {
        return await loadConversationMessages(queryClient, conversationId, actorId, {
          recentOnly: true,
        });
      } catch (error) {
        const cached = readMessagesCache(queryClient, conversationId);
        if (cached.length) {
          return mergeMessagesWithLocalCache(queryClient, conversationId, cached);
        }
        throw error;
      }
    },
    enabled: !!conversationId && !!actorId,
    staleTime: 120_000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnWindowFocus: false,
    refetchOnMount: (query) => {
      const decision = shouldRefetchWhenEmpty(query);
      if (decision !== false) return decision;
      const cached = query?.state?.data;
      if (Array.isArray(cached) && cached.length > 0 && cached.length < CHAT_INITIAL_MESSAGE_LIMIT) {
        return true;
      }
      return false;
    },
    refetchOnReconnect: false,
    initialData: () => {
      if (!conversationId) return undefined;
      const cached = readMessagesCache(queryClient, conversationId);
      return cached.length ? cached : undefined;
    },
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });

  // Realtime is now handled by useGlobalRealtimeMessages at the App level
  // This ensures instant updates without duplicate subscriptions

  // Always merge live cache (temp-* / failed sends) — setQueryData patches must show
  // even when query.data is a stale snapshot.
  const data = useMemo(() => {
    if (!conversationId) return normalizeMessagesCache(query.data);
    return mergeMessagesWithLocalCache(
      queryClient,
      conversationId,
      query.data,
    );
  }, [conversationId, queryClient, query.data, query.dataUpdatedAt]);

  return { ...query, data };
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

export function useMarkMessageViewed(conversationId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      if (typeof messageId === 'string' && messageId.startsWith('temp-')) return;

      const { error } = await db
        .from('message_views')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
        }, { onConflict: 'message_id,user_id', ignoreDuplicates: true });

      if (error) throw error;

      const { data: msg } = await db
        .from('messages')
        .select('id, view_mode, saved_by_sender, saved_by_recipient, expires_at, viewed_at')
        .eq('id', messageId)
        .maybeSingle();

      if (
        msg &&
        msg.view_mode === '24h' &&
        !msg.saved_by_sender &&
        !msg.saved_by_recipient &&
        !msg.expires_at
      ) {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        await db
          .from('messages')
          .update({ expires_at: expiresAt, viewed_at: new Date().toISOString() })
          .eq('id', messageId);
      }
    },
    onSuccess: (_data, messageId) => {
      if (typeof messageId === 'string' && messageId.startsWith('temp-')) return;
      const viewedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const patchRow = (old: Message[] | undefined) => {
        if (!old?.some((m) => m.id === messageId)) return old;
        return old.map((m) => {
          if (m.id !== messageId) return m;
          const nextExpires =
            m.view_mode === '24h' && !m.saved_by_sender && !m.saved_by_recipient
              ? (m.expires_at || expiresAt)
              : m.expires_at;
          return {
            ...m,
            viewed_at: m.viewed_at || viewedAt,
            expires_at: nextExpires,
            views: [
              ...(m.views || []).filter((v) => v.user_id !== profile?.id),
              { user_id: profile!.id, viewed_at: viewedAt },
            ],
          };
        });
      };
      if (conversationId) {
        patchMessagesCache(queryClient, conversationId, patchRow);
        return;
      }
      queryClient.setQueriesData<Message[]>({ queryKey: ['messages'] }, patchRow);
    },
  });
}

/** Lock Vybe snap after the one allowed hold-replay (persists across refresh). */
export function useMarkVybeReplayExhausted(conversationId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!messageId || messageId.startsWith('temp-') || messageId.startsWith('vybe-')) return;
      const { error } = await db
        .from('messages')
        .update({ view_mode: 'vybe_locked', viewed_at: new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
    },
    onSuccess: (_data, messageId) => {
      const patchRow = (old: Message[] | undefined) => {
        if (!old?.some((m) => m.id === messageId)) return old;
        return old.map((m) =>
          m.id === messageId
            ? { ...m, vybe_replay_exhausted: true, view_mode: 'vybe_locked' }
            : m,
        );
      };
      if (conversationId) {
        patchMessagesCache(queryClient, conversationId, patchRow as any);
      } else {
        queryClient.setQueriesData<Message[]>({ queryKey: ['messages'] }, patchRow as any);
      }
    },
  });
}

/**
 * Toggle saved (kept) state on a 1:1 DM message.
 * Saved messages are exempt from the 48h auto-expiry; both users see the saved state.
 */
export function useToggleSavedMessage(conversationId?: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    // Optimistic flip so the badge animates instantly — never wait on RPC.
    onMutate: async (messageId: string) => {
      if (!conversationId) return;
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
      const previous = queryClient.getQueryData<Message[]>(['messages', conversationId]);
      const profileId = profile?.id;
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        const profileId = profile?.id;
        if (!profileId) return old;
        return old.map((m) => (m.id === messageId ? applyMessageSaveToggle(m, profileId) : m));
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
      const myProfileId = (await resolveSessionProfileId(profile?.id)) || profile?.id;
      if (!myProfileId) throw new Error('Not authenticated');

      const { data: { user: authUser } } = await firebaseAuth.getUser();
      if (authUser?.id) {
        await syncUserAuthIndex(authUser.id, myProfileId);
      }

      // For 1:1 DMs, use Firebase client (deterministic id + membership seed)
      if (!isGroup && memberIds.length === 1) {
        const rawOtherId = memberIds[0];
        const otherUserId = (await normalizeToProfileId(rawOtherId)) || rawOtherId;

        const conversationId = await createDmChat(otherUserId);
        if (!conversationId) {
          throw new Error('Failed to start conversation');
        }

        await ensureConversationReady(
          conversationId,
          myProfileId,
          otherUserId,
        );

        const { data: conv } = await db
          .from('conversations')
          .select('*')
          .eq('id', conversationId)
          .maybeSingle();

        if (conv) return conv;

        const sortedMemberIds = [myProfileId, otherUserId].sort();
        return {
          id: conversationId,
          is_group: false,
          member_ids: sortedMemberIds,
          name: null,
          created_by: myProfileId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }

      // For group chats, use the existing multi-step approach
      const { data: conversation, error: convError } = await db
        .from('conversations')
        .insert({
          is_group: isGroup,
          name: isGroup ? name : null,
          created_by: myProfileId,
        })
        .select()
        .single();

      if (convError) throw convError;

      const allMemberIds = [...new Set([myProfileId, ...memberIds])];
      const membersToInsert = allMemberIds.map((userId) => ({
        conversation_id: conversation.id,
        user_id: userId,
        role: userId === myProfileId ? 'admin' : 'member',
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
            .select('user_id, started_at')
            .eq('conversation_id', conversationId)
            .gt('started_at', new Date(Date.now() - 5000).toISOString());

          setTypingUsers(
            (data || [])
              .filter((t) => t.user_id !== profile?.id)
              .map((t) => t.user_id),
          );
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
  const seenEventIds = useRef(new Set<string>());

  const addScreenshotEvent = useCallback((id: string, username: string, timestamp: string) => {
    if (seenEventIds.current.has(id)) return;
    seenEventIds.current.add(id);
    haptics.warning();
    toast.warning(`📸 ${username} took a screenshot!`, {
      icon: '📸',
      duration: 5000,
    });
    setScreenshotEvents((prev) => [...prev, { id, username, timestamp }]);
  }, []);

  const handleIncomingCapture = useCallback(
    (payload: DmScreenshotPayload) => {
      if (!profile?.id || payload.userId === profile.id) return;
      const username = payload.username || 'Someone';
      if (payload.captureType === 'screenshot') {
        addScreenshotEvent(payload.id, username, payload.timestamp);
        return;
      }
      if (payload.captureType === 'screen_recording_start') {
        toast.warning(`🎥 ${username} started screen recording`, { duration: 5000 });
        setIsRecording(true);
      } else if (payload.captureType === 'screen_recording_stop') {
        toast.info('Screen recording stopped', { duration: 3000 });
        setIsRecording(false);
      }
    },
    [profile?.id, addScreenshotEvent],
  );

  const notifyCapture = useCallback(async (captureType: CaptureType) => {
    if (!conversationId || !profile?.id) return;

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

    const eventId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    void sendDmBroadcastScreenshot(conversationId, {
      id: eventId,
      userId: profile.id,
      username: profile.username || undefined,
      captureType,
      timestamp,
    });

    try {
      if (captureType === 'screenshot') {
        await db.from('screenshot_notifications').insert({
          conversation_id: conversationId,
          user_id: profile.id,
        });
      }

      await db.from('messages').insert({
        conversation_id: conversationId,
        sender_id: profile.id,
        content,
        message_type: messageType,
      });

      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    } catch (err) {
      console.error('[Capture] Capture notification error:', err);
    }
  }, [conversationId, profile?.id, profile?.username, queryClient]);

  // Convenience wrapper for screenshot (backward compatible)
  const notifyScreenshot = useCallback(() => notifyCapture('screenshot'), [notifyCapture]);

  // Instant screenshot alerts via DM broadcast (works across tabs/devices).
  useEffect(() => {
    if (!conversationId) return;

    prewarmDmBroadcastChannel(conversationId);
    const unsubBroadcast = subscribeDmBroadcastScreenshot(conversationId, handleIncomingCapture);

    const channel = subscribePostgresChannel(`screenshots:${conversationId}`, [
      {
        event: 'INSERT',
        table: 'screenshot_notifications',
        filter: `conversation_id=eq.${conversationId}`,
        callback: async (payload) => {
          if ((payload.new as { user_id?: string }).user_id === profile?.id) return;

          const { data: user } = await db
            .from('profiles')
            .select('username')
            .eq('id', (payload.new as { user_id: string }).user_id)
            .single();

          const username = user?.username || 'Someone';
          addScreenshotEvent(
            (payload.new as { id: string }).id,
            username,
            (payload.new as { created_at: string }).created_at,
          );
        },
      },
    ]);

    return () => {
      unsubBroadcast();
      removeRealtimeChannel(channel);
    };
  }, [conversationId, profile?.id, handleIncomingCapture, addScreenshotEvent]);

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
        const existing = ensureArray(target.reactions).find(r => r.user_id === userId);
        let nextReactions = [...ensureArray(target.reactions)];

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
      const authUid = await getSessionAuthUid();
      await markConversationReadForViewer(conversationId, profile.id, authUid);
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

      const authUid = await getSessionAuthUid();
      await markConversationReadForViewer(conversationId, profile.id, authUid);
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
