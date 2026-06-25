import type { QueryClient } from '@tanstack/react-query';
import { prepareMessagesRoute } from '@/lib/loadDMConversations';

/** Clear only DM-related queries — avoids wiping the whole app cache on recoverable errors. */
export function recoverDmQueryCache(
  queryClient: QueryClient,
  profileId?: string | null,
  authUid?: string | null,
): void {
  queryClient.removeQueries({ queryKey: ['messages'] });
  queryClient.removeQueries({ queryKey: ['conversation-detail'] });
  queryClient.removeQueries({ queryKey: ['dm-conversations'] });
  queryClient.removeQueries({ queryKey: ['conversations'] });
  queryClient.removeQueries({ queryKey: ['unread-messages-count'] });
  queryClient.removeQueries({ queryKey: ['typing_indicators'] });
  queryClient.removeQueries({ queryKey: ['chat_presence'] });
  prepareMessagesRoute(queryClient, profileId ?? undefined, authUid ?? undefined);
}

export function isRecoverableDmCacheError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /maximum call stack size exceeded/i.test(msg) ||
    /maximum update depth exceeded/i.test(msg) ||
    /JSON\.stringify|cyclical|circular/i.test(msg)
  );
}
