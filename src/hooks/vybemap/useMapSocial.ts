import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { mapSocialAttempt, mapSocialRequest, type MapMutation, type MapPage, type MapReceipt, type MapRows, type MapScope } from '@/lib/vybemap/mapSocialService';
import type { MapMeetup, MapPlace } from '@/lib/vybemap/types';
import { captureMapSocialRoute, currentMapSocialRoute, mapRouteAccountScope, type MapSocialRouteLease } from '@/lib/vybemap/mapSocialRouteLease';

export function useMapViewGuard(selection = '') {
  const account = useProfileAccount();
  const scope = `${account.user?.id}:${account.profile?.id}:${account.session.epoch}:${selection}`;
  const view = useMemo(() => ({ active: true }), [scope]);
  const currentView = useRef(view);
  currentView.current = view;
  useEffect(() => { view.active = true; return () => { view.active = false; }; }, [view]);
  const guard = () => { account.guard(); if (!view.active || currentView.current !== view) throw Object.assign(new Error('This map view changed. Open it again.'), { code: 'account-changed' }); };
  return { account, scope, guard };
}

function useMapVisibility(key: readonly unknown[], deadline: number) {
  const client = useQueryClient();
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const [, tick] = useReducer(n => n + 1, 0);
  const scope = JSON.stringify(key);
  useEffect(() => {
    const change = () => {
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
      setVisible(document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [client, scope]);
  useEffect(() => {
    if (!Number.isFinite(deadline) || deadline <= Date.now()) return;
    const timer = setTimeout(tick, deadline - Date.now() + 5); return () => clearTimeout(timer);
  }, [deadline, scope]);
  return visible;
}

export function useMapSocialList<S extends MapScope>(scope: S, targetId?: string, enabled = true) {
  const client = useQueryClient();
  const view = useMapViewGuard(`${scope}:${targetId || ''}`);
  const [window, setWindow] = useState<{ scope: string; cursor?: string }>({ scope: view.scope });
  const startCursor = window.scope === view.scope ? window.cursor : undefined;
  const key = ['map-social', view.scope, scope, targetId || null, startCursor || null] as const;
  const query = useInfiniteQuery({
    queryKey: key, enabled: enabled && view.account.ready && document.visibilityState !== 'hidden',
    initialPageParam: startCursor,
    queryFn: async ({ pageParam, signal }) => {
      const guard = () => { view.guard(); if (signal.aborted) throw new Error('Map view closed.'); };
      const page = await mapSocialRequest({ uid: view.account.user!.id, profileId: view.account.profile!.id }, { action: 'list', scope, ...(targetId ? { targetId } : {}), ...(pageParam ? { cursor: pageParam } : {}) }, guard) as MapPage<MapRows[S]>;
      guard(); return page;
    },
    getNextPageParam: last => last.nextCursor || undefined,
    staleTime: 0, gcTime: 0, placeholderData: undefined, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 10_000,
  });
  const deadline = Math.min(...(query.data?.pages.map(page => page.validUntil) || []));
  const visible = useMapVisibility(key, deadline);
  const current = view.account.ready && enabled && visible && query.isFetchedAfterMount && !query.isPlaceholderData && !query.isError && deadline > Date.now();
  const data = useMemo(() => current ? query.data?.pages.flatMap(page => page.items).filter((row, i, rows) => rows.findIndex(other => other.id === row.id) === i) : undefined, [current, query.data]);
  const nextGroup = (query.data?.pages.length || 0) >= 3;
  const fetchNextPage = async () => {
    view.guard();
    if (!nextGroup) return query.fetchNextPage();
    const cursor = query.data?.pages.at(-1)?.nextCursor;
    if (cursor) setWindow({ scope: view.scope, cursor });
  };
  const restart = async () => {
    view.guard();
    if (startCursor) setWindow({ scope: view.scope });
    else await client.resetQueries({ queryKey: key, exact: true });
  };
  return { ...query, data, nextGroup, fetchNextPage, windowed: !!startCursor, restart, isLoading: enabled && view.account.ready && !data && !query.isError, guardCurrent: view.guard };
}

export function useMapSocialItem<K extends 'place' | 'meetup'>(kind: K, targetId: string) {
  const client = useQueryClient();
  const view = useMapViewGuard(`${kind}:${targetId}`);
  const key = ['map-social', view.scope, kind, targetId];
  const query = useQuery({
    queryKey: key, enabled: view.account.ready && !!targetId && document.visibilityState !== 'hidden',
    queryFn: async ({ signal }) => {
      const guard = () => { view.guard(); if (signal.aborted) throw new Error('Map view closed.'); };
      const result = await mapSocialRequest({ uid: view.account.user!.id, profileId: view.account.profile!.id }, { action: 'read', kind, targetId }, guard) as unknown as { item: (K extends 'place' ? MapPlace : MapMeetup) | null; validUntil: number };
      guard(); return result;
    },
    staleTime: 0, gcTime: 0, placeholderData: undefined, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 10_000,
  });
  const visible = useMapVisibility(key, query.data?.validUntil || Infinity);
  const current = view.account.ready && visible && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData && !!query.data && query.data.validUntil > Date.now();
  const captureRouteLease = () => {
    view.guard(); if (!current || !query.data?.item) throw new Error('Refresh this map item before starting directions.');
    return captureMapSocialRoute(client, key, mapRouteAccountScope(view.account.user?.id, view.account.profile?.id, view.account.session.epoch), kind, targetId);
  };
  return { ...query, data: current ? query.data!.item : undefined, isLoading: view.account.ready && !current && !query.isError, guardCurrent: view.guard, captureRouteLease };
}

/** Keep admission polling alive after its sheet closes, and expire retained route geometry with it. */
export function useMapSocialRouteAdmission(lease: MapSocialRouteLease | undefined) {
  const client = useQueryClient(), account = useProfileAccount();
  useMapSocialItem(lease?.kind || 'place', lease?.id || '');
  const scope = mapRouteAccountScope(account.user?.id, account.profile?.id, account.session.epoch);
  return account.ready ? currentMapSocialRoute(client, lease, scope) : undefined;
}

export function useMapSocialMutation(selection = '') {
  const view = useMapViewGuard(selection), client = useQueryClient();
  const pending = useRef(false);
  const mutation = useMutation({
    mutationFn: async (input: MapMutation) => {
      view.guard(); if (pending.current) throw new Error('A map change is still saving.');
      pending.current = true;
      const actor = { uid: view.account.user!.id, profileId: view.account.profile!.id };
      let attempt: Awaited<ReturnType<typeof mapSocialAttempt>> | undefined;
      try {
        attempt = await mapSocialAttempt(actor, input); view.guard();
        const receipt = await mapSocialRequest(actor, attempt.body, view.guard) as MapReceipt;
        view.guard(); attempt.complete();
        // A replay describes current state, not permission to install a stale item.
        await client.cancelQueries({ queryKey: ['map-social'] }); view.guard();
        await client.invalidateQueries({ queryKey: ['map-social'] }); view.guard();
        if (receipt.status === 'unavailable' || (input.action === 'joinMeetup' && receipt.status !== 'going') || (input.action === 'leaveMeetup' && receipt.status !== 'left')) throw new Error('This map item changed. Refresh it before trying again.');
        return receipt;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && /(^|\/)(invalid-argument|already-exists|aborted)$/.test(String(error.code))) attempt?.complete();
        throw error;
      } finally { pending.current = false; }
    },
  });
  return { ...mutation, guardCurrent: view.guard };
}
