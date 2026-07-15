import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
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
  theme_mode?: 'default' | 'mine' | 'theirs' | 'blend' | 'custom';
  theme_tokens?: Record<string, string> | null;
  capture_alert_prefs?: {
    popup?: boolean;
    push?: boolean;
    sound?: boolean;
    haptics?: boolean;
  } | null;
  chat_font: string;
  chat_sound: string;
  chat_wallpaper: string | null;
  emotional_pulse: EmotionalPulse;
  show_emotional_pulse: boolean;
  call_notifications: boolean;
  mention_notifications: boolean;
  reaction_notifications: boolean;
  media_auto_download: boolean;
  disappearing_message_seconds: number | null;
  /** When true, leaving the chat hard-deletes all unsaved messages (any view_mode). */
  delete_unsaved_on_leave: boolean;
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
  call_notifications: true,
  mention_notifications: true,
  reaction_notifications: true,
  media_auto_download: true,
  disappearing_message_seconds: null,
  delete_unsaved_on_leave: false,
};

export function useDMSettings(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dm-settings', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;

      const { data, error } = await db
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

      // Build the full settings object
      const settingsToUpsert = {
        conversation_id: conversationId,
        user_id: profile.id,
        read_receipt_mode: updates.read_receipt_mode ?? query.data?.read_receipt_mode ?? defaultSettings.read_receipt_mode,
        typing_mode: updates.typing_mode ?? query.data?.typing_mode ?? defaultSettings.typing_mode,
        theme: updates.theme ?? query.data?.theme ?? defaultSettings.theme,
        theme_mode: updates.theme_mode ?? query.data?.theme_mode ?? 'default',
        theme_tokens: updates.theme_tokens ?? query.data?.theme_tokens ?? null,
        capture_alert_prefs: updates.capture_alert_prefs ?? query.data?.capture_alert_prefs ?? null,
        chat_font: updates.chat_font ?? query.data?.chat_font ?? defaultSettings.chat_font,
        chat_sound: updates.chat_sound ?? query.data?.chat_sound ?? defaultSettings.chat_sound,
        chat_wallpaper: updates.chat_wallpaper ?? query.data?.chat_wallpaper ?? defaultSettings.chat_wallpaper,
        emotional_pulse: updates.emotional_pulse ?? query.data?.emotional_pulse ?? defaultSettings.emotional_pulse,
        show_emotional_pulse: updates.show_emotional_pulse ?? query.data?.show_emotional_pulse ?? defaultSettings.show_emotional_pulse,
        call_notifications: updates.call_notifications ?? query.data?.call_notifications ?? defaultSettings.call_notifications,
        mention_notifications: updates.mention_notifications ?? query.data?.mention_notifications ?? defaultSettings.mention_notifications,
        reaction_notifications: updates.reaction_notifications ?? query.data?.reaction_notifications ?? defaultSettings.reaction_notifications,
        media_auto_download: updates.media_auto_download ?? query.data?.media_auto_download ?? defaultSettings.media_auto_download,
        disappearing_message_seconds:
          updates.disappearing_message_seconds !== undefined
            ? updates.disappearing_message_seconds
            : query.data?.disappearing_message_seconds ?? defaultSettings.disappearing_message_seconds,
        delete_unsaved_on_leave:
          updates.delete_unsaved_on_leave !== undefined
            ? updates.delete_unsaved_on_leave
            : query.data?.delete_unsaved_on_leave ?? defaultSettings.delete_unsaved_on_leave,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await db
        .from('dm_settings')
        .upsert(settingsToUpsert, { onConflict: 'conversation_id,user_id' })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      // Optimistically update the cache
      queryClient.setQueryData(['dm-settings', conversationId, profile?.id], data);
      queryClient.invalidateQueries({ queryKey: ['dm-settings', conversationId] });
    },
  });

  // Get partner's settings (for read receipts display logic)
  const partnerSettings = useQuery({
    queryKey: ['dm-settings-partner', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return null;

      const { data, error } = await db
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

/**
 * Hook to get the effective content safety settings for a DM
 * Returns the stricter setting between both users
 */
export function useCrossUserSafetySettings(conversationId: string | undefined) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['cross-user-safety', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return { requiresScan: true, level: 'protected' };
      
      // Get both users' sensitivity preferences
      const { data: members } = await db
        .from('conversation_members')
        .select(`
          user_id,
          profile:profiles!user_id(sensitivity_preference)
        `)
        .eq('conversation_id', conversationId);
      
      if (!members?.length) return { requiresScan: true, level: 'protected' };
      
      // Get sensitivity levels
      const levels = members.map(m => {
        const pref = (m.profile as any)?.sensitivity_preference || 'protected';
        return pref;
      });
      
      // If either user has 'protected', require full scanning
      if (levels.includes('protected')) {
        return { requiresScan: true, level: 'protected', message: 'This chat requires content scanning for safety' };
      }
      
      // If either user has 'moderate', show warnings
      if (levels.includes('moderate')) {
        return { requiresScan: true, level: 'moderate', message: 'Content will be scanned with warnings' };
      }
      
      // Both users are 'unfiltered' - no scanning required
      return { requiresScan: false, level: 'unfiltered' };
    },
    enabled: !!conversationId && !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Hook for memory pins
export function useMessagePins(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['message-pins', conversationId, profile?.id],
    queryFn: async () => {
      if (!conversationId || !profile?.id) return [];

      // Use a join-based approach via RPC or filter by user only,
      // then filter client-side, to avoid massive .in() queries
      const { data, error } = await db
        .from('message_pins')
        .select('*, message:messages!inner(conversation_id)')
        .eq('user_id', profile.id)
        .eq('message.conversation_id', conversationId);

      if (error) throw error;
      return data || [];
    },
    enabled: !!conversationId && !!profile?.id,
  });

  const pinMessage = useMutation({
    mutationFn: async ({ messageId, label }: { messageId: string; label?: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db
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

      const { error } = await db
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

      const { data, error } = await db
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

      const { error } = await db
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
      const { error } = await db
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

      const { data, error } = await db
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

      const { data, error } = await db
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

      const { data, error } = await db
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

      const { error } = await db
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

      const { data, error } = await db
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

      const { error } = await db
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
