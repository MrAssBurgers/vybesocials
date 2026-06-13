import type { QueryClient } from '@tanstack/react-query';

/** Invalidate both legacy and DM list caches (mobile + desktop stay in sync). */
export function invalidateConversationCaches(
  queryClient: QueryClient,
  profileId?: string | null,
): void {
  if (profileId) {
    queryClient.invalidateQueries({ queryKey: ['dm-conversations', profileId] });
    queryClient.invalidateQueries({ queryKey: ['conversations', profileId] });
    return;
  }
  queryClient.invalidateQueries({ queryKey: ['dm-conversations'] });
  queryClient.invalidateQueries({ queryKey: ['conversations'] });
}

/** Optimistically patch both list caches with the same updater. */
export function patchConversationListCaches<T>(
  queryClient: QueryClient,
  profileId: string,
  patch: (old: T[] | undefined) => T[] | undefined,
): void {
  queryClient.setQueryData(['dm-conversations', profileId], patch);
  queryClient.setQueryData(['conversations', profileId], patch);
}
