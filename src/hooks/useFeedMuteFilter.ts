import { filterMutedPosts } from '@/lib/feedMuteService';
import { useFeedMutes } from '@/hooks/useFeedMutes';
import { useMemo } from 'react';

type FeedPost = { author?: { id?: string }; author_id?: string };
type FeedData = FeedPost[] | { pages: { posts: FeedPost[]; [key: string]: unknown }[]; [key: string]: unknown };
type Query = { data?: unknown; error?: unknown; isPending?: boolean; isLoading?: boolean; isError?: boolean; isFetching?: boolean; refetch: (...args: never[]) => Promise<unknown> };

/** Filter the observer result, including persisted/placeholder pages, not the stored feed.
 * This hides a newly muted author immediately and makes undo restore cached posts.
 */
export function useFeedMuteFilter<T extends Query>(query: T, bypass = false): T {
  const mutes = useFeedMutes(!bypass);
  const data = useMemo(() => {
    const source = query.data as FeedData | undefined;
    if (bypass) return source;
    if (!mutes.ready) return undefined;
    if (!source || !mutes.aliases.size) return source;
    return Array.isArray(source) ? filterMutedPosts(source, mutes.aliases)
      : { ...source, pages: source.pages.map(page => ({ ...page, posts: filterMutedPosts(page.posts, mutes.aliases) })) };
  }, [query.data, mutes.ready, mutes.aliases, bypass]);
  if (bypass || (!mutes.key[1] && mutes.ready)) return query;
  return { ...query, data,
    isPending: query.isPending || (!mutes.ready && !mutes.isError),
    isLoading: query.isLoading || (!mutes.ready && !mutes.isError),
    isFetching: query.isFetching || mutes.isFetching,
    isError: query.isError || mutes.isError,
    error: mutes.error || query.error,
    refetch: async (...args: never[]) => { await mutes.refetch(); return query.refetch(...args); },
  } as T;
}
