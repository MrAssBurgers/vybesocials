import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export interface LockedChatRow {
  conversation_id: string;
  user_id: string;
  locked_at: string;
  preview_hidden: boolean;
}

const QUERY_KEY = 'locked-chats';

export function useLockedChatIds() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: [QUERY_KEY, profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Set<string>> => {
      if (!profileId) return new Set();
      const { data, error } = await db
        .from('locked_chats')
        .select('conversation_id')
        .eq('user_id', profileId);
      if (error) {
        console.warn('[useLockedChats] load failed', error);
        return new Set();
      }
      return new Set((data ?? []).map((r: { conversation_id: string }) => r.conversation_id));
    },
    staleTime: 30_000,
  });
}

export function useLockConversation() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not signed in');
      const { error } = await db.from('locked_chats').upsert({
        conversation_id: conversationId,
        user_id: profileId,
        locked_at: new Date().toISOString(),
        preview_hidden: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, profileId] });
      qc.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    },
  });
}

export function useUnlockConversation() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not signed in');
      const { error } = await db
        .from('locked_chats')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QUERY_KEY, profileId] });
    },
  });
}
