import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

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
    staleTime: 5000,
    refetchInterval: 15000,
  });
}

export function useConversations() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['conversations', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Fetch conversations with members in a single query
      const { data: conversations, error } = await supabase
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
        .order('updated_at', { ascending: false });

      if (error) throw error;
      if (!conversations?.length) return [];

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

      // Build final result with unread counts
      const result = conversations.map(conv => {
        const memberRecord = conv.members?.find((m: any) => m.user_id === profile.id);
        const lastReadAt = memberRecord?.last_read_at || '1970-01-01';
        
        // Count unread from cached messages
        const unreadCount = (allMessages || []).filter(
          msg => msg.conversation_id === conv.id && 
                 msg.sender_id !== profile.id && 
                 msg.created_at > lastReadAt
        ).length;

        return {
          ...conv,
          last_message: lastMessageMap.get(conv.id) || null,
          unread_count: unreadCount,
        };
      });

      return result as Conversation[];
    },
    enabled: !!profile?.id,
    staleTime: 10000, // Cache for 10 seconds
    refetchOnWindowFocus: false,
  });

  // Real-time subscription for conversations
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('conversations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => queryClient.invalidateQueries({ queryKey: ['conversations'] })
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => queryClient.invalidateQueries({ queryKey: ['conversations'] })
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

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
          views:message_views(user_id, viewed_at),
          reactions:message_reactions(user_id, emoji)
        `)
        .eq('conversation_id', conversationId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Filter out expired view_once messages that have been viewed
      const filtered = (data || []).filter((msg) => {
        if (msg.view_mode === 'view_once' && msg.sender_id !== profile?.id) {
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
    staleTime: 5000,
    refetchOnWindowFocus: false,
  });

  // Subscribe to real-time updates
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

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
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
        });

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

export function useScreenshotNotification(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const notifyScreenshot = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    await supabase
      .from('screenshot_notifications')
      .insert({
        conversation_id: conversationId,
        user_id: profile.id,
      });

    toast.info('Screenshot detected and notified to chat members');
  }, [conversationId, profile?.id]);

  // Listen for screenshot notifications
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
          if (payload.new.user_id !== profile?.id) {
            const { data: user } = await supabase
              .from('profiles')
              .select('username')
              .eq('id', payload.new.user_id)
              .single();

            toast.warning(`${user?.username || 'Someone'} took a screenshot!`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, profile?.id]);

  return { notifyScreenshot };
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

      const { error } = await supabase
        .from('message_reactions')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
          emoji,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
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
