import { useEffect, useRef, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useFeedMuteFilter } from '@/hooks/useFeedMuteFilter';
import type { LocalArea } from '@/lib/localArea';
import { readSocialFeed } from '@/lib/socialFeedService';

/** Current-account feed pages live only in memory while this surface is visible. */
export function useSocialFeed(contentType?: 'post' | 'short' | 'video', enabled = true, feed: 'discover' | 'personalized' | 'following' | 'local' = 'discover', area?: LocalArea) {
  const account = useProfileAccount();
  const [visibility, setVisibility] = useState({ visible: document.visibilityState !== 'hidden', epoch: 0 });
  const lease = useRef(0);
  const activation = useRef({ enabled, epoch: 0 });
  if (activation.current.enabled !== enabled) {
    activation.current = { enabled, epoch: activation.current.epoch + 1 };
    lease.current++;
  }
  useEffect(() => {
    const changed = () => { lease.current++; setVisibility(previous => ({ visible: document.visibilityState !== 'hidden', epoch: previous.epoch + 1 })); };
    document.addEventListener('visibilitychange', changed);
    return () => { document.removeEventListener('visibilitychange', changed); };
  }, []);
  const active = enabled && (feed !== 'local' || !!area) && visibility.visible && account.ready;
  const current = useRef(active); current.current = active;
  const query = useInfiniteQuery({
    queryKey: ['social-feed', account.session.uid, account.session.epoch, account.profile?.id, contentType, feed, area?.lat, area?.lng, visibility.epoch, activation.current.epoch],
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
    staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always', refetchInterval: 30000, retry: false,
  });
  // No stale fallback after a failed authority check or across an account/visibility change.
  return useFeedMuteFilter({ ...query, data: active && !query.isError ? query.data : undefined });
}
