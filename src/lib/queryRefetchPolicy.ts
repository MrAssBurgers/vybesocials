/** True when an infinite-feed query has at least one post in cache. */
export function infiniteQueryHasPosts(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const pages = (data as { pages?: { posts?: unknown[] }[] }).pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((p) => Array.isArray(p?.posts) && p.posts.length > 0);
}

/**
 * Refetch on mount when cache is empty.
 * Must return 'always' (not true) so TanStack Query refetches even when
 * staleTime hasn't elapsed — otherwise empty persisted caches never reload.
 *
 * Typed as `any` for the query arg so it doesn't collapse the generic
 * inference of `useInfiniteQuery` to `unknown` (which would break
 * `lastPage.nextPage` / `page.posts` typing across every feed hook).
 */
export function refetchFeedOnMount(query: any): boolean | 'always' {
  return infiniteQueryHasPosts(query?.state?.data) ? false : 'always';
}

/** Refetch on mount when cached array is empty (messages, lists, etc.). */
export function shouldRefetchWhenEmpty(query: any): boolean | 'always' {
  const data = query?.state?.data;
  if (!Array.isArray(data) || data.length === 0) return 'always';
  return false;
}

/**
 * Inbox seeds often leave only 1 preview message. Force a background hydrate
 * so opening a chat never sticks on the seed forever (staleTime would otherwise
 * skip the network).
 */
export function shouldRefetchWhenEmptyOrSparse(
  query: any,
  minComplete = 8,
): boolean | 'always' {
  const data = query?.state?.data;
  if (!Array.isArray(data) || data.length === 0) return 'always';
  if (data.length < minComplete) return 'always';
  return false;
}

import { isPermissionDeniedError } from '@/lib/logOnce';

/** Refetch DM list on mount when never fetched or errored; respect staleTime for empty lists. */
export function refetchListOnMount(query: any): boolean | 'always' {
  const data = query?.state?.data;
  const status = query?.state?.status;
  const dataUpdatedAt = query?.state?.dataUpdatedAt as number | undefined;
  if (status === 'error') {
    if (isPermissionDeniedError(query?.state?.error)) return false;
    if (!Array.isArray(data) || data.length === 0) return 'always';
  }
  // Only force refetch on the very first load — not on every pending refetch (caused refetch storms + skeleton).
  if (status === 'pending' && !dataUpdatedAt) return 'always';
  if (!Array.isArray(data)) return 'always';
  // Empty but successfully fetched — use normal stale refetch (not 'always'),
  // otherwise every Messages visit re-skeletons while background refetch runs.
  if (data.length === 0) return true;
  return false;
}
