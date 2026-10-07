import { useInfiniteQuery } from '@tanstack/react-query';
import { readSocialPostList, type SocialPostSelection } from '@/lib/socialPostListService';
import { usePostReadView } from './usePostReadView';
import type { Post } from './useInfinitePosts';
import { usePostReadWindow } from './usePostReadWindow';
import { usePostReadRecovery } from './usePostReadRecovery';
import { withPostReadDeadline } from '@/lib/postReadDeadline';

export function useSocialPostList(selection: SocialPostSelection, enabled = true) {
  const view = usePostReadView(enabled), { account } = view;
  const window = usePostReadWindow(JSON.stringify([selection, ...view.key]));
  const recovery = usePostReadRecovery(JSON.stringify([selection, ...view.key, window.cursor]), view.guard);
  const query = useInfiniteQuery({
    placeholderData: undefined,
    queryKey: ['social-post-list', selection, ...view.key, window.cursor], enabled: view.active,
    initialPageParam: window.cursor, gcTime: 0, staleTime: 0, retry: recovery.retry, retryDelay: recovery.retryDelay,
    refetchInterval: 20000, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    queryFn: ({ pageParam, signal }) => {
      recovery.beforeRead(signal);
      return withPostReadDeadline(current => readSocialPostList({ ...selection, expectedOwnerUid: account.user!.id, expectedProfileId: account.profile!.id,
        ...(pageParam ? { cursor: pageParam } : {}) }, current), () => recovery.guard(signal), signal);
    },
    getNextPageParam: (last, pages, _param, params) => pages.length < 4 && last.nextCursor && !params.includes(last.nextCursor) ? last.nextCursor : undefined,
  });
  view.observeLeases(query.data?.pages.map(page => page.leaseUntil) ?? []);
  const expired = view.leaseExpired;
  const available = view.active && !query.isPlaceholderData && !query.isError && !expired;
  const posts = new Map<string, Post>(), unavailable = new Set<string>();
  if (available) for (const page of query.data?.pages ?? []) {
    for (const post of page.posts) if (!posts.has(post.id)) posts.set(post.id, post);
    for (const id of page.unavailableSavedPostIds) unavailable.add(id);
  }
  for (const id of unavailable) posts.delete(id);
  const full = (query.data?.pages.length ?? 0) >= 4;
  const nextCursor = query.data?.pages.at(-1)?.nextCursor;
  return { ...query, data: available && query.data ? [...posts.values()] : undefined,
    hasNextPage: query.hasNextPage && !full,
    fetchNextPage: (...args: Parameters<typeof query.fetchNextPage>) => full ? Promise.resolve(query) : query.fetchNextPage(...args),
    hasMoreWindow: available && full && !!nextCursor,
    advanceWindow: async () => { view.guard(); if (available && nextCursor) window.advance(nextCursor); },
    hasPreviousWindow: window.hasPreviousWindow, previousWindow: window.previousWindow, restartWindow: window.restart,
    unavailableSavedPostIds: available ? [...unavailable] : [], isError: query.isError || expired,
    error: expired ? new Error('Post access expired. Refresh these posts.') : query.error };
}
