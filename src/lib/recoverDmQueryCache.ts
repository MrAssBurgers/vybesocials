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

export const LAST_BOUNDARY_ERROR_KEY = 'vybe-last-boundary-error';

export function persistBoundaryError(error: unknown): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const stack = error instanceof Error ? error.stack?.slice(0, 800) : undefined;
    sessionStorage.setItem(
      LAST_BOUNDARY_ERROR_KEY,
      JSON.stringify({ message, stack, at: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

export function readLastBoundaryError(): { message: string; stack?: string; at?: string } | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(LAST_BOUNDARY_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { message?: string; stack?: string; at?: string };
    return parsed?.message ? { message: parsed.message, stack: parsed.stack, at: parsed.at } : null;
  } catch {
    return null;
  }
}

export function isRecoverableDmCacheError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    /maximum call stack size exceeded/i.test(msg) ||
    /maximum update depth exceeded/i.test(msg) ||
    /JSON\.stringify|cyclical|circular/i.test(msg) ||
    /messagesContainerRef is not defined/i.test(msg) ||
    /showPeerPresence is not defined/i.test(msg) ||
    /registeredConvoRef is not defined/i.test(msg) ||
    /\.get is not a function/i.test(msg) ||
    /\.has is not a function/i.test(msg) ||
    /\.filter is not a function/i.test(msg) ||
    /is not iterable/i.test(msg) ||
    /statusMap\.get is not a function/i.test(msg)
  );
}
