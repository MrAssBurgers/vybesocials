import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export type ReadReceiptMode = 'instant' | 'after_reply' | 'never' | 'fake';
export type TypingMode = 'normal' | 'hidden' | 'always_show' | 'frozen';
export type EmotionalPulse = 'nervous' | 'excited' | 'calm' | 'drained' | null;

export interface DMSettings {
  id: string;
  conversation_id: string;
  user_id: string;
  read_receipt_mode: ReadReceiptMode;
  typing_mode: TypingMode;
  theme: string;
  chat_font: string;
  chat_sound: string;
  chat_wallpaper: string | null;
  emotional_pulse: EmotionalPulse;
  show_emotional_pulse: boolean;
  created_at: string;
  updated_at: string;
}

const defaultSettings: Partial<DMSettings> = {
  read_receipt_mode: 'instant',
  typing_mode: 'normal',
  theme: 'default',
  chat_font: 'default',
  chat_sound: 'default',
  chat_wallpaper: null,
  emotional_pulse: null,
  show_emotional_pulse: false,
};

export function useDMSettings(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dm-settings', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;

      const { data, error } = await supabase
        .from('dm_settings')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;
      return data as DMSettings | null;
    },
    enabled: !!conversationId && !!profile?.id,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<DMSettings>) => {
      if (!conversationId || !profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('dm_settings')
        .upsert({
          conversation_id: conversationId,
          user_id: profile.id,
          ...defaultSettings,
          ...query.data,
          ...updates,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'conversation_id,user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dm-settings', conversationId] });
    },
  });

  // Get partner's settings (for read receipts display logic)
  const partnerSettings = useQuery({
    queryKey: ['dm-settings-partner', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;

      const { data, error } = await supabase
        .from('dm_settings')
        .select('*')
        .eq('conversation_id', conversationId)
        .neq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;
      return data as DMSettings | null;
    },
    enabled: !!conversationId && !!profile?.id,
  });

  return {
    settings: query.data || defaultSettings as DMSettings,
    partnerSettings: partnerSettings.data,
    updateSettings: updateSettings.mutate,
    isLoading: query.isLoading,
  };
}

// Hook for memory pins
export function useMessagePins(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['message-pins', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return [];

      // Get messages in conversation first
      const { data: messages } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conversationId);

      if (!messages?.length) return [];

      const messageIds = messages.map(m => m.id);

      const { data, error } = await supabase
        .from('message_pins')
        .select('*')
        .eq('user_id', profile.id)
        .in('message_id', messageIds);

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId && !!profile?.id,
  });

  const pinMessage = useMutation({
    mutationFn: async ({ messageId, label }: { messageId: string; label?: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('message_pins')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
          label,
        }, { onConflict: 'message_id,user_id' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-pins', conversationId] });
    },
  });

  const unpinMessage = useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('message_pins')
        .delete()
        .eq('message_id', messageId)
        .eq('user_id', profile.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-pins', conversationId] });
    },
  });

  return {
    pins: query.data || [],
    pinMessage: pinMessage.mutate,
    unpinMessage: unpinMessage.mutate,
    isPinned: (messageId: string) => query.data?.some(p => p.message_id === messageId),
  };
}

// Hook for scheduled messages
export function useScheduledMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['scheduled-messages', conversationId],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return [];

      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('sender_id', profile.id)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId && !!profile?.id,
  });

  const scheduleMessage = useMutation({
    mutationFn: async ({
      content,
      scheduledAt,
      mediaUrl,
      mediaType,
      viewMode = 'permanent',
    }: {
      content?: string;
      scheduledAt: Date;
      mediaUrl?: string;
      mediaType?: string;
      viewMode?: string;
    }) => {
      if (!conversationId || !profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('scheduled_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
          view_mode: viewMode,
          scheduled_at: scheduledAt.toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', conversationId] });
    },
  });

  const cancelScheduledMessage = useMutation({
    mutationFn: async (messageId: string) => {
      const { error } = await supabase
        .from('scheduled_messages')
        .update({ status: 'cancelled' })
        .eq('id', messageId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-messages', conversationId] });
    },
  });

  return {
    scheduledMessages: query.data || [],
    scheduleMessage: scheduleMessage.mutate,
    cancelScheduledMessage: cancelScheduledMessage.mutate,
  };
}

// Hook for vanish threads
export function useVanishThreads(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['vanish-threads', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('vanish_threads')
        .select('*')
        .eq('conversation_id', conversationId)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId,
  });

  const createThread = useMutation({
    mutationFn: async (title?: string) => {
      if (!conversationId || !profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('vanish_threads')
        .insert({
          conversation_id: conversationId,
          created_by: profile.id,
          title,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vanish-threads', conversationId] });
    },
  });

  return {
    threads: query.data || [],
    createThread: createThread.mutateAsync,
  };
}

export function useVanishMessages(threadId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['vanish-messages', threadId],
    queryFn: async () => {
      if (!threadId) return [];

      const { data, error } = await supabase
        .from('vanish_messages')
        .select(`
          *,
          sender:profiles!sender_id(id, username, avatar_url, display_name)
        `)
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!threadId,
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      content,
      mediaUrl,
      mediaType,
    }: {
      content?: string;
      mediaUrl?: string;
      mediaType?: string;
    }) => {
      if (!threadId || !profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('vanish_messages')
        .insert({
          thread_id: threadId,
          sender_id: profile.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vanish-messages', threadId] });
    },
  });

  return {
    messages: query.data || [],
    sendMessage: sendMessage.mutate,
  };
}

// Word reactions hook
export function useWordReactions(messageId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['word-reactions', messageId],
    queryFn: async () => {
      if (!messageId) return [];

      const { data, error } = await supabase
        .from('word_reactions')
        .select('*')
        .eq('message_id', messageId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!messageId,
  });

  const addWordReaction = useMutation({
    mutationFn: async ({
      wordStart,
      wordEnd,
      emoji,
    }: {
      wordStart: number;
      wordEnd: number;
      emoji: string;
    }) => {
      if (!messageId || !profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('word_reactions')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
          word_start: wordStart,
          word_end: wordEnd,
          emoji,
        }, { onConflict: 'message_id,user_id,word_start,word_end' });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['word-reactions', messageId] });
    },
  });

  return {
    reactions: query.data || [],
    addWordReaction: addWordReaction.mutate,
  };
}
