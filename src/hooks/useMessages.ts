import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { callSounds } from '@/lib/callSounds';
import { sendMessagePush } from '@/lib/pushNotifications';

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
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unread-messages-count', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return 0;

      // Get conversations the user is part of
      const { data: memberships } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at')
        .eq('user_id', profile.id);

      if (!memberships?.length) return 0;

      let totalUnread = 0;
      for (const membership of memberships) {
        const lastReadAt = membership.last_read_at || '1970-01-01';
        const { count } = await supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('conversation_id', membership.conversation_id)
          .neq('sender_id', profile.id)
          .gt('created_at', lastReadAt)
          .eq('is_deleted', false);

        totalUnread += count || 0;
      }

      return totalUnread;
    },
    enabled: !!profile?.id,
    staleTime: 30000, // 30 seconds - faster updates for badge sync
    refetchInterval: 60000, // Check every minute
    refetchOnWindowFocus: true, // Ensure fresh count when user returns
  });
}

export function useConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Fetch hidden conversations and conversations in parallel
      // First get the conversation IDs the user is a member of
      const { data: membershipData, error: membershipError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id);
      
      if (membershipError) throw membershipError;
      if (!membershipData?.length) return [];
      
      const userConversationIds = membershipData.map(m => m.conversation_id);

      const [hiddenResult, conversationsResult] = await Promise.all([
        supabase
          .from('hidden_conversations')
          .select('conversation_id')
          .eq('user_id', profile.id),
        supabase
          .from('conversations')
          .select(`
            *,
            members:conversation_members(
              user_id,
              role,
              is_muted,
              is_pinned,
              last_read_at,
              profile:profiles(id, username, avatar_url, display_name)
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
      const { data: allMessages } = await supabase
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
        const memberRecord = c.members?.find((m: any) => m.user_id === profile.id);
        const hiddenAt = hiddenResult.data?.find(h => h.conversation_id === c.id);
        // If there's a message after the conversation was hidden, show it
        const lastMsg = (allMessages || []).find(msg => msg.conversation_id === c.id);
        if (lastMsg && hiddenAt) {
          // Note: We'd need hidden_at timestamp to properly check this
          // For now, we show if there's any unread message
          const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
          return lastMsg.sender_id !== profile.id && lastMsg.created_at > lastReadAt;
        }
        return false;
      });

      // Add back conversations with new messages
      const finalConversations = [...conversations, ...hiddenConvsWithNewMessages];

      // Build final result with unread counts
      const result = finalConversations.map(conv => {
        const memberRecord = conv.members?.find((m: any) => m.user_id === profile.id);
        const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
        
        // Count unread from cached messages
        const unreadCount = (allMessages || []).filter(
          msg => msg.conversation_id === conv.id && 
                 msg.sender_id !== profile.id && 
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
    enabled: !!profile?.id,
    staleTime: 60000, // 1 minute cache
    refetchOnWindowFocus: true, // Refetch when user returns to app
    refetchOnMount: 'always', // Always get fresh data on mount
    refetchOnReconnect: true, // Refetch when connection is restored
  });

  // Realtime updates are now handled by useGlobalRealtimeMessages at App level
  // This prevents duplicate subscriptions and ensures consistent updates

  return query;
}

export function useMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select(`
          *,
          sender:profiles!sender_id(id, username, avatar_url, display_name),
          views:message_views(user_id, viewed_at, profile:profiles!user_id(id, username, avatar_url, display_name)),
          reactions:message_reactions(user_id, emoji)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter out expired view_once messages that have been viewed
      // But keep vybe messages — they show as "Opened" after viewing, not hidden
      const filtered = (data || []).filter((msg) => {
        if (msg.view_mode === 'view_once' && msg.media_type !== 'vybe' && msg.sender_id !== profile?.id) {
          const hasViewed = msg.views?.some((v: any) => v.user_id === profile?.id);
          if (hasViewed) return false;
        }
        if (msg.expires_at && new Date(msg.expires_at) < new Date()) {
          return false;
        }
        return true;
      });

      return filtered as Message[];
    },
    enabled: !!conversationId && !!profile?.id,
    staleTime: 30000,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always', // ALWAYS refetch on mount to ensure fresh data
    refetchOnReconnect: true, // Refetch when connection is restored
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

      const { data, error } = await supabase
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
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      
      // Send push notifications to other conversation members
      if (data && profile) {
        try {
          // Get conversation members (excluding sender)
          const { data: members } = await supabase
            .from('conversation_members')
            .select('user_id, is_muted')
            .eq('conversation_id', variables.conversationId)
            .neq('user_id', profile.id);
          
          // Get conversation info
          const { data: conversation } = await supabase
            .from('conversations')
            .select('is_group, name')
            .eq('id', variables.conversationId)
            .single();
          
          const senderName = profile.display_name || profile.username || 'Someone';
          const messagePreview = variables.mediaType 
            ? (variables.mediaType === 'image' ? '📷 Photo' : 
               variables.mediaType === 'voice' ? '🎤 Voice' : '📎 Media')
            : (variables.content?.slice(0, 50) || 'New message');
          
          // Send push to each non-muted member
          const pushPromises = (members || [])
            .filter(m => !m.is_muted)
            .map(member => 
              sendMessagePush(
                member.user_id,
                senderName,
                messagePreview,
                variables.conversationId,
                conversation?.is_group || false,
                conversation?.name || undefined
              )
            );
          
          // Fire and forget - don't wait for pushes
          Promise.all(pushPromises).catch(err => {
            console.error('[Push] Failed to send message pushes:', err);
          });
        } catch (err) {
          console.error('[Push] Error sending push notifications:', err);
        }
      }
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
      const { data: message, error: fetchError } = await supabase
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
      const { error } = await supabase
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
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

      const { error } = await supabase
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
        
        const { data: conversationId, error: rpcError } = await supabase
          .rpc('create_dm_conversation', { other_profile_id: otherUserId });

        if (rpcError) {
          console.error('create_dm_conversation RPC error:', rpcError);
          throw new Error(rpcError.message || 'Failed to start conversation');
        }

        // Fetch the full conversation object to return
        const { data: conv, error: fetchError } = await supabase
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
      const { data: conversation, error: convError } = await supabase
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

      const { error: membersError } = await supabase
        .from('conversation_members')
        .insert(membersToInsert);

      if (membersError) {
        await supabase.from('conversations').delete().eq('id', conversation.id);
        throw membersError;
      }

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
      await supabase
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
      await supabase
        .from('typing_indicators')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);
    }
  }, [conversationId, profile?.id]);

  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`typing:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async () => {
          const { data } = await supabase
            .from('typing_indicators')
            .select('user_id')
            .eq('conversation_id', conversationId)
            .neq('user_id', profile?.id || '')
            .gt('started_at', new Date(Date.now() - 5000).toISOString());

          setTypingUsers(data?.map((t) => t.user_id) || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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
        const { error } = await supabase
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
      const { error: msgError } = await supabase
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

    const channel = supabase
      .channel(`screenshots:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'screenshot_notifications',
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          if ((payload.new as any).user_id !== profile?.id) {
            const { data: user } = await supabase
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

      const { data, error } = await supabase
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
      const { data: existing } = await supabase
        .from('message_reactions')
        .select('emoji')
        .eq('message_id', messageId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing?.emoji === emoji) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', profile.id);
        if (error) throw error;
        return { messageId, emoji, removed: true };
      }

      // Upsert (delete-then-insert was race-prone; use single upsert)
      const { error: upsertError } = await supabase
        .from('message_reactions')
        .upsert(
          { message_id: messageId, user_id: profile.id, emoji },
          { onConflict: 'message_id,user_id' }
        );
      if (upsertError) throw upsertError;
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

      const { error } = await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
      const { data: myMemberships } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id);

      if (!myMemberships?.length) return;

      const conversationIds = myMemberships.map(m => m.conversation_id);

      // Find conversations where the target user is also a member AND it's a 1:1 (not group)
      const { data: targetMemberships } = await supabase
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

      const { error } = await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

      const { error } = await supabase
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
