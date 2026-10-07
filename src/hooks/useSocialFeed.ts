import { useEffect } from 'react';
import { useInfiniteQuery, type InfiniteData } from '@tanstack/react-query';
import { usePostReadRecovery } from './usePostReadRecovery';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import { usePostReadView } from './usePostReadView';
import type { LocalArea } from '@/lib/localArea';
import { readSocialFeed } from '@/lib/socialFeedService';
import { usePostReadWindow } from './usePostReadWindow';
import { withPostReadDeadline } from '@/lib/postReadDeadline';
import { readAdmittedPage, writeAdmittedPage } from '@/lib/admittedReadCache';

/** Feed payloads require a current account, visible surface, and unexpired read. */
export function useSocialFeed(contentType?: 'post' | 'short' | 'video', enabled = true, feed: 'discover' | 'personalized' | 'following' | 'local' = 'discover', area?: LocalArea) {
  const view = usePostReadView(enabled && (feed !== 'local' || !!area)), { account } = view;
  const window = usePostReadWindow(JSON.stringify([contentType, feed, area, ...view.key]));
  const selection = JSON.stringify([...view.key, contentType, feed, area, window.cursor]);
  const recovery = usePostReadRecovery(selection, view.guard);
  const cacheKey = JSON.stringify(['social-feed', account.session.uid, account.session.epoch, account.profile?.id, contentType, feed, area?.lat, area?.lng, window.cursor]);
  const admitted = view.active ? readAdmittedPage<InfiniteData<Awaited<ReturnType<typeof readSocialFeed>>>>(cacheKey) : undefined;
  const query = useInfiniteQuery({
    placeholderData: undefined,
    queryKey: ['social-feed', ...view.key, contentType, feed, area?.lat, area?.lng, window.cursor],
    enabled: view.active, initialPageParam: window.cursor,
    initialData: admitted?.data,
    initialDataUpdatedAt: admitted?.savedAt,
    queryFn: ({ pageParam, signal }) => {
      recovery.beforeRead(signal);
      return withPostReadDeadline(current => readSocialFeed({ expectedOwnerUid: account.user!.id, expectedProfileId: account.profile!.id,
        feed, ...(feed === 'local' && area ? { area } : {}), ...(contentType ? { contentType } : {}), ...(typeof pageParam === 'string' ? { cursor: pageParam } : {}) }, current), () => recovery.guard(signal), signal);
    },
    getNextPageParam: (last, pages, _lastParam, pageParams) => pages.length < 4 && last.nextCursor && !pageParams.includes(last.nextCursor) ? last.nextCursor : undefined,
    // A fresh lease paints again without a focus refetch storm. The 20s
    // refresh still replaces the lease before the 30s admission ends.
    staleTime: 12_000, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false, refetchOnReconnect: true, refetchInterval: 20000,
    retry: recovery.retry, retryDelay: recovery.retryDelay,
  });
  view.observeLeases(query.data?.pages.map(page => page.leaseUntil) ?? []);
  useEffect(() => {
    const leaseUntil = query.data?.pages.reduce((soonest, page) => Math.min(soonest, page.leaseUntil), Number.POSITIVE_INFINITY);
    if (query.isSuccess && !query.isError && leaseUntil && Number.isFinite(leaseUntil)) writeAdmittedPage(cacheKey, query.data, leaseUntil);
  }, [cacheKey, query.data, query.isError, query.isSuccess]);
  const expired = view.leaseExpired;
  const full = (query.data?.pages.length ?? 0) >= 4, nextCursor = query.data?.pages.at(-1)?.nextCursor;
  const available = view.active && !query.isPlaceholderData && !query.isError && !expired;
  return useFeedMuteFilter({ ...query, data: view.active && !query.isPlaceholderData && !query.isError && !expired ? query.data : undefined,
    hasNextPage: query.hasNextPage && !full,
    fetchNextPage: (...args: Parameters<typeof query.fetchNextPage>) => full ? Promise.resolve(query) : query.fetchNextPage(...args),
    hasMoreWindow: available && full && !!nextCursor,
    advanceWindow: async () => { view.guard(); if (available && nextCursor) window.advance(nextCursor); },
    windowIndex: window.windowIndex, hasPreviousWindow: window.hasPreviousWindow, previousWindow: window.previousWindow, restartWindow: window.restart,
    isError: query.isError || expired, error: expired ? new Error('Feed access expired. Refresh to continue.') : query.error });
}
