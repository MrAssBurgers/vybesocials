import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type ConversationImportance = 'silent' | 'low' | 'default' | 'high';

export interface ConversationNotifPrefs {
  id?: string;
  conversation_id: string;
  user_id: string;
  muted_until: string | null;
  sound: string | null;
  vibration_pattern: string | null;
  importance: ConversationImportance;
  native_channel_id: string | null;
}

const empty = (
  conversationId: string,
  userId: string
): ConversationNotifPrefs => ({
  conversation_id: conversationId,
  user_id: userId,
  muted_until: null,
  sound: null,
  vibration_pattern: null,
  importance: 'default',
  native_channel_id: null,
});

export function useConversationNotifPrefs(conversationId: string | null) {
  // Auth user id (notif prefs use auth.uid(), not profile.id, per RLS)
  const authUserId = supabase.auth.getSession ? undefined : undefined;

  return useQuery({
    queryKey: ['conversation-notif-prefs', conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !conversationId) return null;
      const { data, error } = await supabase
        .from('conversation_notification_prefs')
        .select('*')
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return (data as ConversationNotifPrefs | null) ?? empty(conversationId, user.id);
    },
  });
}

export function useUpdateConversationNotifPrefs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (next: Partial<ConversationNotifPrefs> & { conversation_id: string }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const payload = {
        conversation_id: next.conversation_id,
        user_id: user.id,
        muted_until: next.muted_until ?? null,
        sound: next.sound ?? null,
        vibration_pattern: next.vibration_pattern ?? null,
        importance: next.importance ?? 'default',
        native_channel_id: next.native_channel_id ?? null,
      };

      const { data, error } = await supabase
        .from('conversation_notification_prefs')
        .upsert(payload, { onConflict: 'conversation_id,user_id' })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data as ConversationNotifPrefs;
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.setQueryData(['conversation-notif-prefs', data.conversation_id], data);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'Failed to update notifications');
    },
  });
}

/** Mute helper that translates "1h"/"8h"/"1d"/"forever" → ISO string. */
export function muteDurationToIso(duration: '1h' | '8h' | '1d' | 'forever' | 'off'): string | null {
  if (duration === 'off') return null;
  if (duration === 'forever') return new Date('9999-12-31T23:59:59Z').toISOString();
  const ms = duration === '1h' ? 3600_000 : duration === '8h' ? 8 * 3600_000 : 24 * 3600_000;
  return new Date(Date.now() + ms).toISOString();
}

export function isMuted(prefs: ConversationNotifPrefs | null | undefined): boolean {
  if (!prefs?.muted_until) return false;
  return new Date(prefs.muted_until).getTime() > Date.now();
}
