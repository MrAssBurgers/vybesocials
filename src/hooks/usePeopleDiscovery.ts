import { useEffect, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';

/** One shared, current-account discovery read; never reuse disk or expired grants. */
export function usePeopleDiscovery() {
  const actor = useProfileAccount(), client = useQueryClient();
  const paused = useRef(false);
  const [view, setView] = useState(() => ({ visible: document.visibilityState !== 'hidden', revision: 0 }));
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const key = ['people-discovery', actor.user?.id, actor.profile?.id, actor.session.epoch, view.revision];
  const scope = JSON.stringify(key);
  const query = useQuery({
    queryKey: key, enabled: actor.ready && view.visible,
    queryFn: async ({ signal }) => {
      const guard = () => { actor.guard(); if (signal.aborted) throw new Error('Suggestions changed. Please retry.'); };
      guard();
      const { readPeopleDiscovery } = await import('@/lib/peopleDiscoveryService');
      guard();
      return readPeopleDiscovery({ uid: actor.user!.id, profileId: actor.profile!.id }, { limit: 120 }, guard);
    },
    staleTime: 0, gcTime: 0, retry: false, placeholderData: undefined,
    refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 10_000,
  });
  useEffect(() => {
    const change = () => {
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
      setView(value => ({ visible: !paused.current && document.visibilityState !== 'hidden', revision: value.revision + 1 }));
    };
    const pause = () => { paused.current = true; change(); };
    const resume = () => { paused.current = false; change(); };
    document.addEventListener('visibilitychange', change);
    window.addEventListener('online', change);
    window.addEventListener('app-paused', pause);
    window.addEventListener('app-resumed', resume);
    return () => {
      document.removeEventListener('visibilitychange', change);
      window.removeEventListener('online', change);
      window.removeEventListener('app-paused', pause);
      window.removeEventListener('app-resumed', resume);
    };
  }, [client, scope]);
  const expiry = query.data?.validUntil;
  useEffect(() => {
    if (expiry === undefined || expiry <= Date.now()) return;
    const timer = setTimeout(tick, expiry - Date.now() + 5);
    return () => clearTimeout(timer);
  }, [expiry, scope]);
  let current = actor.ready && view.visible && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData && !!query.data && query.data.validUntil > Date.now();
  try { actor.guard(); } catch { current = false; }
  return { ...query, actor, data: current ? query.data : undefined,
    isLoading: actor.ready && view.visible && !current && !query.isError,
    retry: () => { void query.refetch(); } };
}
