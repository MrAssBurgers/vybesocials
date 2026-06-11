import type { Query } from '@tanstack/react-query';

/** True when an infinite-feed query has at least one post in cache. */
export function infiniteQueryHasPosts(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const pages = (data as { pages?: { posts?: unknown[] }[] }).pages;
  if (!Array.isArray(pages)) return false;
  return pages.some((p) => Array.isArray(p?.posts) && p.posts.length > 0);
}

/** Refetch on mount when cache is empty; otherwise respect staleTime. */
export function refetchFeedOnMount(query: Query): boolean {
  return !infiniteQueryHasPosts(query.state.data);
}

/** Refetch DM list on mount when empty or errored with no rows. */
export function refetchListOnMount(query: Query): boolean {
  const data = query.state.data;
  if (query.state.status === 'error' && (!Array.isArray(data) || data.length === 0)) return true;
  if (!Array.isArray(data) || data.length === 0) return true;
  return false;
}
