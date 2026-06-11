/** True when an infinite-feed query has at least one post in cache. */
export function infiniteQueryHasPosts(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const pages = (data as { pages?: { posts?: unknown[] }[] }).pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((p) => Array.isArray(p?.posts) && p.posts.length > 0);
}

/**
 * Refetch on mount when cache is empty; otherwise respect staleTime.
 *
 * Typed as `any` for the query arg so it doesn't collapse the generic
 * inference of `useInfiniteQuery` to `unknown` (which would break
 * `lastPage.nextPage` / `page.posts` typing across every feed hook).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refetchFeedOnMount(query: any): boolean {
  return !infiniteQueryHasPosts(query?.state?.data);
}

/** Refetch DM list on mount when empty or errored with no rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function refetchListOnMount(query: any): boolean {
  const data = query?.state?.data;
  const status = query?.state?.status;
  if (status === 'error' && (!Array.isArray(data) || data.length === 0)) return true;
  if (!Array.isArray(data) || data.length === 0) return true;
  return false;
}
