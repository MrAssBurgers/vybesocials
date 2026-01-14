import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function useHiddenConversations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['hidden-conversations', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return new Set<string>();

      const { data, error } = await supabase
        .from('hidden_conversations')
        .select('conversation_id')
        .eq('user_id', profile.id);

      if (error) throw error;
      return new Set(data?.map(h => h.conversation_id) || []);
    },
    enabled: !!profile?.id,
    staleTime: 30000,
  });
}

export function useHideConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('hidden_conversations')
        .insert({
          user_id: profile.id,
          conversation_id: conversationId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
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
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('hidden_conversations')
        .delete()
        .eq('user_id', profile.id)
        .eq('conversation_id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['hidden-conversations'] });
    },
  });
}
