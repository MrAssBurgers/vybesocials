import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { dmPrivateKey, useDmAccountMutation, useDmActorScope } from './useDmAccountMutation';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { toast } from 'sonner';

export function useHiddenConversations() {
  const scope = useDmActorScope();
  return useQuery({
    queryKey: ['hidden-conversations', scope.profileId, scope.session.uid, scope.session.epoch],
    enabled: scope.ready,
    queryFn: async ({ signal }) => {
      const actor = scope.capture(); actor.guard();
      if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError');
      const { data, error } = await db.from('hidden_conversations').select('conversation_id').eq('user_id', actor.profileId);
      actor.guard(); if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError');
      if (error) throw error;
      return new Set<string>(data?.map(row => row.conversation_id) || []);
    },
  });
}

function useHiddenAction(hide: boolean, quiet = false) {
  const client = useQueryClient();
  return useDmAccountMutation({
    capture: (conversationId: string) => conversationId,
    mutationFn: async ({ value: conversationId, actor }) => {
      actor.guard();
      const result = hide
        ? await db.from('hidden_conversations').upsert({ user_id: actor.profileId, conversation_id: conversationId }, { onConflict: 'user_id,conversation_id' })
        : await db.from('hidden_conversations').delete().eq('user_id', actor.profileId).eq('conversation_id', conversationId);
      actor.guard(); if (result.error) throw result.error;
    },
    onSuccess: (_data, { actor }) => {
      invalidateConversationCaches(client, actor.profileId, actor.session);
      void client.invalidateQueries({ queryKey: dmPrivateKey('hidden-conversations', actor), exact: true });
      if (hide && !quiet) toast.success('Chat removed from inbox');
    },
    onError: () => { if (hide && !quiet) toast.error('Could not remove this chat'); },
  });
}
export const useHideConversation = (options?: { quiet?: boolean }) => useHiddenAction(true, options?.quiet);
export const useUnhideConversation = () => useHiddenAction(false);
