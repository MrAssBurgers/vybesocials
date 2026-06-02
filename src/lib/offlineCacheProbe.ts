import type { QueryClient } from '@tanstack/react-query';

const FEED_KEY_MARKERS = [
  'infinite-posts',
  'personalized-feed',
  'infinite-following-posts',
  'local-feed',
] as const;

const SOCIAL_KEY_MARKERS = [
  'dm-conversations',
  'conversations',
  'notifications',
  'stories',
  'profile',
] as const;

function hasPagesWithPosts(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const pages = (data as { pages?: unknown[] }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return false;
  return pages.some((page) => {
    const posts = (page as { posts?: unknown[] })?.posts;
    return Array.isArray(posts) && posts.length > 0;
  });
}

function hasNonEmptyArray(data: unknown): boolean {
  return Array.isArray(data) && data.length > 0;
}

function queryHasUsableCache(queryKey: readonly unknown[], data: unknown): boolean {
  const flat = JSON.stringify(queryKey).toLowerCase();
  if (FEED_KEY_MARKERS.some((m) => flat.includes(m))) {
    return hasPagesWithPosts(data);
  }
  if (SOCIAL_KEY_MARKERS.some((m) => flat.includes(m))) {
    if (flat.includes('profile')) return data != null && typeof data === 'object';
    return hasNonEmptyArray(data);
  }
  return false;
}

/** True when React Query already has feed/social data (memory or post-persist hydrate). */
export function hasWarmOfflineCache(queryClient: QueryClient): boolean {
  const queries = queryClient.getQueryCache().getAll();
  for (const query of queries) {
    if (query.state.data === undefined) continue;
    if (queryHasUsableCache(query.queryKey, query.state.data)) return true;
  }
  return false;
}
