import type { QueryClient } from '@tanstack/react-query';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { dmThreadLog } from '@/lib/dmThreadDebug';

/** Thread-only recovery — never reloads the app or remounts Messages. */
export function retryDmThreadQueries(
  queryClient: QueryClient,
  conversationId: string | undefined,
): void {
  if (!conversationId) return;
  dmThreadLog('retryThreadQueries', conversationId);
  void queryClient.cancelQueries({ queryKey: messagesQueryKey(conversationId) });
  void queryClient.invalidateQueries({ queryKey: messagesQueryKey(conversationId) });
  void queryClient.invalidateQueries({ queryKey: ['conversation-detail', conversationId] });
  void queryClient.refetchQueries({ queryKey: messagesQueryKey(conversationId) });
  void queryClient.refetchQueries({ queryKey: ['conversation-detail', conversationId] });
}

/** Cancel in-flight message fetches for every conversation except the selected one. */
export function cancelStaleDmMessageQueries(
  queryClient: QueryClient,
  selectedConversationId: string | undefined,
): void {
  void queryClient
    .cancelQueries({
      predicate: (query) => {
        const key = query.queryKey;
        if (key[0] !== 'messages') return false;
        return key[1] !== selectedConversationId;
      },
    })
    .catch(() => {
      /* CancelledError is expected */
    });
  dmThreadLog('cancelStaleMessageQueries', selectedConversationId);
}
