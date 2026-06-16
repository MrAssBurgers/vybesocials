import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { normalizePersistedSet } from '@/lib/persistedCollections';

export function useHiddenConversations() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['hidden-conversations', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await db
        .from('hidden_conversations')
        .select('conversation_id')
        .eq('user_id', profileId);

      if (error) throw error;
      return new Set(data?.map(h => h.conversation_id) || []);
    },
    enabled: !!profileId,
    staleTime: 30000,
    select: normalizePersistedSet,
  });
}

export function useHideConversation() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('hidden_conversations')
        .insert({
          user_id: profileId,
          conversation_id: conversationId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['hidden-conversations'] });
      toast.success('Chat deleted');
    },
    onError: (error: any) => {
      console.error('Failed to hide conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

export function useUnhideConversation() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('hidden_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['hidden-conversations'] });
    },
  });
}
