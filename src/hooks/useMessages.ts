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

export function useConversations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['conversations', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

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

      // Get last message for each conversation
      const conversationsWithMessages = await Promise.all(
        (conversations || []).map(async (conv) => {
          const { data: messages } = await supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conv.id)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(1);

          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
            .eq('is_deleted', false)
            .neq('sender_id', profile.id)
            .gt('created_at', conv.members?.find((m: any) => m.user_id === profile.id)?.last_read_at || '1970-01-01');

          return {
            ...conv,
            last_message: messages?.[0] || null,
            unread_count: unreadCount || 0,
          };
        })
      );

      return conversationsWithMessages as Conversation[];
    },
    enabled: !!profile?.id,
  });
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

      // Create conversation
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

      // Add all members including creator
      const allMemberIds = [...new Set([profile.id, ...memberIds])];
      const members = allMemberIds.map((userId) => ({
        conversation_id: conversation.id,
        user_id: userId,
        role: userId === profile.id ? 'admin' : 'member',
      }));

      const { error: memberError } = await supabase
        .from('conversation_members')
        .insert(members);

      if (memberError) throw memberError;

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useTypingIndicator(conversationId: string | undefined) {
  const { profile } = useAuth();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !profile?.id) return;

    if (isTyping) {
      await supabase
        .from('typing_indicators')
        .upsert({
          conversation_id: conversationId,
          user_id: profile.id,
          started_at: new Date().toISOString(),
        });
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
