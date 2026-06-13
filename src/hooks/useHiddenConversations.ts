import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';

export function useHiddenConversations() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['hidden-conversations', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await supabase
        .from('hidden_conversations')
        .select('conversation_id')
        .eq('user_id', profileId);

      if (error) throw error;
      return new Set(data?.map(h => h.conversation_id) || []);
    },
    enabled: !!profileId,
    staleTime: 30000,
    select: (data: unknown): Set<string> => {
      if (data instanceof Set) return data as Set<string>;
      if (Array.isArray(data)) return new Set<string>(data.filter((v): v is string => typeof v === 'string'));
      if (data && typeof data === 'object') {
        return new Set<string>(
          Object.values(data as Record<string, unknown>).filter((v): v is string => typeof v === 'string')
        );
      }
      return new Set<string>();
    },
  });
}

export function useHideConversation() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await supabase
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

      const { error } = await supabase
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
