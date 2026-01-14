import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface TrashedConversation {
  id: string;
  user_id: string;
  conversation_id: string;
  trashed_at: string;
  auto_delete_at: string | null;
  conversation?: {
    id: string;
    name: string | null;
    is_group: boolean;
    avatar_url: string | null;
    members?: Array<{
      user_id: string;
      profile: {
        id: string;
        username: string | null;
        avatar_url: string | null;
        display_name: string | null;
      };
    }>;
  };
}

// Fetch all trashed conversations
export function useTrashedConversations() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['trashed-conversations', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('trashed_conversations')
        .select(`
          *,
          conversation:conversations(
            id,
            name,
            is_group,
            avatar_url,
            members:conversation_members(
              user_id,
              profile:profiles(id, username, avatar_url, display_name)
            )
          )
        `)
        .eq('user_id', profile.id)
        .order('trashed_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TrashedConversation[];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
  });
}

// Move conversation to trash
export function useTrashConversation() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id || !user?.id) throw new Error('Not authenticated');

      // hidden_conversations is keyed by auth.users.id (not profiles.id)
      await supabase
        .from('hidden_conversations')
        .delete()
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId);

      // Add to trashed_conversations (keyed by profiles.id)
      const { error } = await supabase
        .from('trashed_conversations')
        .upsert(
          {
            user_id: profile.id,
            conversation_id: conversationId,
            trashed_at: new Date().toISOString(),
            auto_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
          },
          {
            onConflict: 'user_id,conversation_id',
          }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      toast.success('Chat moved to trash');
    },
    onError: (error: any) => {
      console.error('Failed to trash conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

// Restore conversation from trash
export function useRestoreConversation() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profile.id)
        .eq('conversation_id', conversationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      toast.success('Chat restored');
    },
    onError: (error: any) => {
      console.error('Failed to restore conversation:', error);
      toast.error('Failed to restore chat');
    },
  });
}

// Permanently delete conversation (remove from trash)
export function usePermanentlyDeleteConversation() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profile?.id || !user?.id) throw new Error('Not authenticated');

      // Remove from trashed_conversations
      const { error: trashError } = await supabase
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profile.id)
        .eq('conversation_id', conversationId);

      if (trashError) throw trashError;

      // Also add to hidden_conversations to permanently hide it (auth.users.id)
      const { error: hideError } = await supabase
        .from('hidden_conversations')
        .upsert(
          {
            user_id: user.id,
            conversation_id: conversationId,
          },
          {
            onConflict: 'user_id,conversation_id',
          }
        );

      if (hideError) throw hideError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      toast.success('Chat permanently deleted');
    },
    onError: (error: any) => {
      console.error('Failed to permanently delete conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

// Get trashed conversation IDs as a Set for quick lookup
export function useTrashedConversationIds() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['trashed-conversation-ids', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return new Set<string>();

      const { data, error } = await supabase
        .from('trashed_conversations')
        .select('conversation_id')
        .eq('user_id', profile.id);

      if (error) throw error;
      return new Set(data?.map(t => t.conversation_id) || []);
    },
    enabled: !!profile?.id,
    staleTime: 30000,
  });
}
