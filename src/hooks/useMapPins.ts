import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMapViewGuard } from './vybemap/useMapSocial';
import type { MapPinInput, MapPinKind, MapPinPage, MapPinState } from '@/lib/vybemap/mapPinService';

const options = { staleTime: 0, gcTime: 0, placeholderData: undefined, retry: false as const, refetchOnMount: 'always' as const, refetchOnWindowFocus: 'always' as const, refetchInterval: 10_000 };
function usePinView(selection: string, enabled: boolean) {
  const activation = useRef({ enabled, epoch: 0 });
  if (activation.current.enabled !== enabled) activation.current = { enabled, epoch: activation.current.epoch + 1 };
  const [visibility, update] = useReducer(n => n + 1, 0);
  useEffect(() => { const retire = () => update(); document.addEventListener('visibilitychange', retire); window.addEventListener('pagehide', retire); return () => { document.removeEventListener('visibilitychange', retire); window.removeEventListener('pagehide', retire); }; }, []);
  const view = useMapViewGuard(`${selection}:${visibility}:${enabled}:${activation.current.epoch}`);
  const prefix = ['map-pins', view.account.user?.id || '', view.account.profile?.id || '', view.account.session.epoch] as const;
  const visible = document.visibilityState !== 'hidden';
  const request = async (input: MapPinInput, signal: AbortSignal) => {
    const guard = () => { view.guard(); if (signal.aborted || document.visibilityState === 'hidden') throw new Error('This map view changed. Please retry.'); };
    guard(); const { manageMapPin } = await import('@/lib/vybemap/mapPinService'); guard();
    const result = await manageMapPin({ uid: view.account.user!.id, profileId: view.account.profile!.id }, input, guard); guard(); return result;
  };
  return { ...view, prefix, visibility, visible, request };
}
function useDeadline(deadline: number) {
  const [, tick] = useReducer(n => n + 1, 0);
  useEffect(() => { if (!Number.isFinite(deadline) || deadline <= Date.now()) return; const timer = setTimeout(tick, deadline - Date.now() + 1); return () => clearTimeout(timer); }, [deadline]);
  return deadline > Date.now();
}
export function useMapPinState(kind: MapPinKind, sourceId: string, enabled = true) {
  const view = usePinView(`state:${kind}:${sourceId}`, enabled);
  const query = useQuery({ ...options, queryKey: [...view.prefix, 'state', kind, sourceId, view.scope], enabled: enabled && !!sourceId && view.account.ready && view.visible,
    queryFn: ({ signal }) => view.request({ action: 'state', kind, sourceId }, signal) as Promise<MapPinState>,
  });
  const fresh = useDeadline(query.data?.validUntil || 0);
  const current = enabled && view.account.ready && view.visible && fresh && query.isFetchedAfterMount && !query.isPlaceholderData && !query.isError;
  return { ...query, data: current ? query.data : undefined, isLoading: enabled && !current && !query.isError, guardCurrent: view.guard, account: view.account, scope: view.scope };
}
export function useMapPinList(kind: MapPinKind, enabled = true) {
  const view = usePinView(`list:${kind}`, enabled), client = useQueryClient();
  const [window, setWindow] = useState<{ scope: string; cursor?: string }>({ scope: view.scope });
  const startCursor = window.scope === view.scope ? window.cursor : undefined;
  const key = [...view.prefix, 'list', kind, startCursor || null, view.scope] as const;
  const query = useInfiniteQuery({ ...options, queryKey: key, enabled: enabled && view.account.ready && view.visible, initialPageParam: startCursor,
    queryFn: ({ pageParam, signal }) => view.request({ action: 'list', kind, ...(pageParam ? { cursor: pageParam } : {}) }, signal) as Promise<MapPinPage>,
    getNextPageParam: page => page.nextCursor || undefined,
  });
  const fresh = useDeadline(Math.min(...(query.data?.pages.map(page => page.validUntil) || [0])));
  const current = enabled && view.account.ready && view.visible && fresh && query.isFetchedAfterMount && !query.isPlaceholderData && !query.isError;
  const data = useMemo(() => current ? query.data?.pages.flatMap(page => page.items).filter((row, index, rows) => rows.findIndex(other => other.id === row.id) === index) : undefined, [current, query.data]);
  const nextGroup = (query.data?.pages.length || 0) >= 3;
  const more = async () => { view.guard(); if (nextGroup) { const cursor = query.data?.pages.at(-1)?.nextCursor; if (cursor) setWindow({ scope: view.scope, cursor }); } else await query.fetchNextPage(); };
  const restart = async () => { view.guard(); if (startCursor) setWindow({ scope: view.scope }); else await client.resetQueries({ queryKey: key, exact: true }); };
  return { ...query, data, nextGroup, windowed: !!startCursor, restart, fetchNextPage: more, isLoading: enabled && !data && !query.isError };
}
