import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import type { LocalArea } from '@/lib/localArea';
import { readSocialFeed } from '@/lib/socialFeedService';

/** Signed-in feed. Cached pages paint immediately; a new account or area still starts clean. */
export function useSocialFeed(contentType?: 'post' | 'short' | 'video', enabled = true, feed: 'discover' | 'personalized' | 'following' | 'local' = 'discover', area?: LocalArea) {
  const account = useProfileAccount();
  const [visible, setVisible] = useState(document.visibilityState !== 'hidden');
  const lease = useRef(0);
  const enabledRef = useRef(enabled);
  if (enabledRef.current !== enabled) {
    enabledRef.current = enabled;
    lease.current++;
  }
  useEffect(() => {
    const changed = () => { lease.current++; setVisible(document.visibilityState !== 'hidden'); };
    document.addEventListener('visibilitychange', changed);
    return () => { document.removeEventListener('visibilitychange', changed); };
  }, []);
  const active = enabled && (feed !== 'local' || !!area) && visible && account.ready;
  const current = useRef(active); current.current = active;
  const query = useInfiniteQuery({
    queryKey: ['social-feed', account.session.uid, account.session.epoch, account.profile?.id, contentType, feed, area?.lat, area?.lng],
    enabled: active, initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const generation = lease.current;
      const guard = () => {
        account.guard();
        if (signal.aborted || !current.current || lease.current !== generation) throw new Error('Reopen the feed to refresh access.');
      };
      return readSocialFeed({ expectedOwnerUid: account.user!.id, expectedProfileId: account.profile!.id,
        feed, ...(feed === 'local' && area ? { area } : {}), ...(contentType ? { contentType } : {}), ...(pageParam ? { cursor: pageParam } : {}) }, guard);
    },
    getNextPageParam: (last, _pages, _lastParam, pageParams) => {
      if (!last.nextCursor || pageParams.includes(last.nextCursor)) return undefined;
      return last.nextCursor;
    },
    staleTime: 60_000,
    gcTime: 30 * 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: false,
  });
  const queryRef = useRef(query);
  queryRef.current = query;
  const activeRef = useRef(active);
  useEffect(() => {
    const was = activeRef.current;
    activeRef.current = active;
    const cached = queryRef.current;
    if (!was && active && (cached.data || cached.isError || cached.isFetched)) void cached.refetch();
  }, [active]);
  // Hide the surface while it is inactive, and drop pages when the current read is denied.
  return useFeedMuteFilter({ ...query, data: active && !query.isError ? query.data : undefined });
}
