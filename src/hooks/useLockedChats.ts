import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { dmPrivateKey, useDmAccountMutation, useDmActorScope } from './useDmAccountMutation';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';

export interface LockedChatRow { conversation_id: string; user_id: string; locked_at: string; preview_hidden: boolean }
export function useLockedChatIds() {
  const scope = useDmActorScope();
  return useQuery({
    queryKey: ['locked-chats', scope.profileId, scope.session.uid, scope.session.epoch], enabled: scope.ready,
    queryFn: async ({ signal }): Promise<Set<string>> => {
      const actor = scope.capture(); actor.guard();
      if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError');
      const { data, error } = await db.from('locked_chats').select('conversation_id').eq('user_id', actor.profileId);
      actor.guard(); if (signal.aborted) throw new DOMException('Read interrupted', 'AbortError');
      if (error) throw error;
      return new Set((data ?? []).map((row: { conversation_id: string }) => row.conversation_id));
    }, staleTime: 30_000,
  });
}
function useLockAction(lock: boolean) {
  const client = useQueryClient();
  return useDmAccountMutation({
    capture: (conversationId: string) => conversationId,
    mutationFn: async ({ value: conversationId, actor }) => {
      actor.guard();
      const result = lock
        ? await db.from('locked_chats').upsert({ conversation_id: conversationId, user_id: actor.profileId, locked_at: new Date().toISOString(), preview_hidden: true })
        : await db.from('locked_chats').delete().eq('user_id', actor.profileId).eq('conversation_id', conversationId);
      actor.guard(); if (result.error) throw result.error;
    },
    onSuccess: (_data, { actor }) => {
      void client.invalidateQueries({ queryKey: dmPrivateKey('locked-chats', actor), exact: true });
      invalidateConversationCaches(client, actor.profileId, actor.session);
    },
  });
}
export const useLockConversation = () => useLockAction(true);
export const useUnlockConversation = () => useLockAction(false);
