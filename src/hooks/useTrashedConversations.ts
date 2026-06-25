import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { invalidateConversationCaches, patchConversationListCaches } from '@/lib/invalidateConversationCaches';
import { normalizePersistedSet } from '@/lib/persistedCollections';

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

export function useTrashedConversations() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['trashed-conversations', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await db
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
        .eq('user_id', profileId)
        .order('trashed_at', { ascending: false });

      if (error) throw error;
      return (data || []) as TrashedConversation[];
    },
    enabled: !!profileId,
    staleTime: 30000,
  });
}

export function useTrashConversation() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId || !user?.id) throw new Error('Not authenticated');

      await db
        .from('hidden_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      const { error } = await db
        .from('trashed_conversations')
        .upsert(
          {
            user_id: profileId,
            conversation_id: conversationId,
            trashed_at: new Date().toISOString(),
            auto_delete_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'user_id,conversation_id' },
        );

      if (error) throw error;
      return conversationId;
    },
    onMutate: async (conversationId: string) => {
      if (!profileId) return {};
      await queryClient.cancelQueries({ queryKey: ['trashed-conversation-ids'] });
      await queryClient.cancelQueries({ queryKey: ['dm-conversations', profileId] });

      const previousIds = queryClient.getQueryData<Set<string>>(['trashed-conversation-ids', profileId]);
      const previousDMs = queryClient.getQueryData(['dm-conversations', profileId]);

      queryClient.setQueryData<Set<string>>(['trashed-conversation-ids', profileId], (old) => {
        const newSet = new Set(old || []);
        newSet.add(conversationId);
        return newSet;
      });

      patchConversationListCaches(queryClient, profileId, (old) => {
        if (!old) return old;
        return old.filter((conv: { id: string }) => conv.id !== conversationId);
      });

      return { previousIds, previousDMs };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversation-ids'] });
      toast.success('Chat moved to trash');
    },
    onError: (error: any, _conversationId, context) => {
      if (profileId && context?.previousIds) {
        queryClient.setQueryData(['trashed-conversation-ids', profileId], context.previousIds);
      }
      if (profileId && context?.previousDMs) {
        queryClient.setQueryData(['dm-conversations', profileId], context.previousDMs);
        queryClient.setQueryData(['conversations', profileId], context.previousDMs);
      }
      console.error('Failed to trash conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

export function useRestoreConversation() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      if (error) throw error;
      return conversationId;
    },
    onMutate: async (conversationId: string) => {
      if (!profileId) return {};
      await queryClient.cancelQueries({ queryKey: ['trashed-conversation-ids'] });

      const previousIds = queryClient.getQueryData<Set<string>>(['trashed-conversation-ids', profileId]);

      queryClient.setQueryData<Set<string>>(['trashed-conversation-ids', profileId], (old) => {
        const newSet = new Set(old || []);
        newSet.delete(conversationId);
        return newSet;
      });

      return { previousIds };
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      queryClient.invalidateQueries({ queryKey: ['trashed-conversation-ids'] });
      toast.success('Chat restored');
    },
    onError: (error: any, _conversationId, context) => {
      if (profileId && context?.previousIds) {
        queryClient.setQueryData(['trashed-conversation-ids', profileId], context.previousIds);
      }
      console.error('Failed to restore conversation:', error);
      toast.error('Failed to restore chat');
    },
  });
}

export function usePermanentlyDeleteConversation() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!profileId || !user?.id) throw new Error('Not authenticated');

      const { error: trashError } = await db
        .from('trashed_conversations')
        .delete()
        .eq('user_id', profileId)
        .eq('conversation_id', conversationId);

      if (trashError) throw trashError;

      const { error: hideError } = await db
        .from('hidden_conversations')
        .upsert(
          { user_id: profileId, conversation_id: conversationId },
          { onConflict: 'user_id,conversation_id' },
        );

      if (hideError) throw hideError;
    },
    onSuccess: () => {
      invalidateConversationCaches(queryClient, profileId);
      queryClient.invalidateQueries({ queryKey: ['trashed-conversations'] });
      toast.success('Chat permanently deleted');
    },
    onError: (error: any) => {
      console.error('Failed to permanently delete conversation:', error);
      toast.error('Failed to delete chat');
    },
  });
}

export function useTrashedConversationIds() {
  const profileId = useAuthProfileId();

  const query = useQuery({
    queryKey: ['trashed-conversation-ids', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await db
        .from('trashed_conversations')
        .select('conversation_id')
        .eq('user_id', profileId);

      if (error) throw error;
      return new Set(data?.map(t => t.conversation_id) || []);
    },
    enabled: !!profileId,
    staleTime: 30000,
    select: normalizePersistedSet,
  });

  return {
    ...query,
    data: normalizePersistedSet(query.data),
  };
}
