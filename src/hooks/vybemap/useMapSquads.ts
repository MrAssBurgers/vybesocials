import { useEffect, useMemo, useReducer, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMapViewGuard } from './useMapSocial';
import { manageMapSquad, type SquadDetail, type SquadMatches, type SquadMutation, type SquadPage, type SquadPreview, type SquadRead, type SquadReceipt } from '@/lib/vybemap/mapSquadService';

const LIST = 'vybemap-group-maps', DETAIL = 'vybemap-group-members';
// A new explicit denial outranks older in-flight pages and independent detail reads.
const denials = new WeakMap<QueryClient, { sequence: number; bySquad: Map<string, number> }>();
function denialState(client: QueryClient) { let state = denials.get(client); if (!state) { state = { sequence: 0, bySquad: new Map() }; denials.set(client, state); } return state; }
const actorPrefix = (view: ReturnType<typeof useMapViewGuard>) => JSON.stringify([view.account.user?.id, view.account.profile?.id, view.account.session.epoch]);
function retireSquad(client: QueryClient, scope: string, id: string) {
  const state = denialState(client); state.bySquad.set(`${scope}${id}`, ++state.sequence);
  const clear = (value: any): any => {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value.pages)) return { ...value, pages: value.pages.map(clear) };
    if (Array.isArray(value.items)) return { ...value, items: value.items.filter((row: { id: string }) => row.id !== id) };
    if (value.squadId !== id) return value;
    return 'matchedProfileIds' in value ? { ...value, matchedProfileIds: [] } : { ...value, squad: null, members: [], nextCursor: null };
  };
  client.setQueriesData({ predicate: query => [LIST, DETAIL].includes(String(query.queryKey[0])) && query.queryKey[1] === scope }, clear);
}
function useVisibility(deadline: number, key: readonly unknown[]) {
  const client = useQueryClient(), [, tick] = useReducer(n => n + 1, 0);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  const scope = JSON.stringify(key);
  useEffect(() => {
    const change = () => { void client.cancelQueries({ queryKey: key, exact: true }); client.removeQueries({ queryKey: key, exact: true }); setVisible(document.visibilityState !== 'hidden'); };
    document.addEventListener('visibilitychange', change); return () => document.removeEventListener('visibilitychange', change);
  }, [client, scope]);
  useEffect(() => { if (!Number.isFinite(deadline) || deadline <= Date.now()) return; const timer = setTimeout(tick, deadline - Date.now() + 1); return () => clearTimeout(timer); }, [deadline, scope]);
  return visible && document.visibilityState !== 'hidden' && deadline > Date.now();
}
const options = { staleTime: 0, gcTime: 0, placeholderData: undefined, retry: false as const, refetchOnMount: 'always' as const, refetchOnWindowFocus: 'always' as const, refetchInterval: 10_000 };
function useSquadRead<T extends SquadDetail | SquadMatches>(input: Extract<SquadRead, { action: 'read' | 'matchMembers' }>, enabled: boolean) {
  const selection = JSON.stringify(input), view = useMapViewGuard(selection);
  const client = useQueryClient();
  const key = [DETAIL, actorPrefix(view), selection] as const;
  const query = useQuery({ ...options, queryKey: key, enabled: enabled && view.account.ready && document.visibilityState !== 'hidden',
    queryFn: async ({ signal }) => {
      const guard = () => { view.guard(); if (signal.aborted) throw new Error('Squad view closed.'); };
      const state = denialState(client), sequence = state.sequence, prefix = actorPrefix(view);
      guard();
      let result = await manageMapSquad({ uid: view.account.user!.id, profileId: view.account.profile!.id }, input, guard) as SquadDetail | SquadMatches; guard();
      if (input.action === 'read' && !(result as SquadDetail).squad) retireSquad(client, prefix, input.squadId);
      if ((state.bySquad.get(`${prefix}${input.squadId}`) || 0) > sequence) result = input.action === 'read' ? { ...result, squad: null, members: [], nextCursor: null } as SquadDetail : { ...result, matchedProfileIds: [] } as SquadMatches;
      return result as T;
    },
  });
  const visible = useVisibility(query.data?.validUntil || 0, key);
  const current = enabled && view.account.ready && visible && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData;
  return { ...query, data: current ? query.data : undefined, isLoading: enabled && !current && !query.isError, guardCurrent: view.guard };
}
export function useSquadDetail(squadId?: string) { return useSquadRead<SquadDetail>({ action: 'read', squadId: squadId || '' }, !!squadId); }
export function useSquadMatches(squadId: string | undefined, candidates: string[]) {
  const ids = useMemo(() => [...new Set(candidates)].sort(), [candidates]);
  return useSquadRead<SquadMatches>({ action: 'matchMembers', squadId: squadId || '', candidateProfileIds: ids }, !!squadId && ids.length <= 100);
}

function useSquadPages(kind: 'list' | 'read', squadId?: string, enabled = true) {
  const view = useMapViewGuard(`${kind}:${squadId || ''}`), client = useQueryClient();
  const [window, setWindow] = useState<{ scope: string; cursor?: string }>({ scope: view.scope });
  const startCursor = window.scope === view.scope ? window.cursor : undefined;
  const key = [kind === 'list' ? LIST : DETAIL, actorPrefix(view), 'pages', kind, squadId || null, startCursor || null] as const;
  const query = useInfiniteQuery({ ...options, queryKey: key, enabled: enabled && view.account.ready && document.visibilityState !== 'hidden', initialPageParam: startCursor,
    queryFn: async ({ pageParam, signal }) => {
      const guard = () => { view.guard(); if (signal.aborted) throw new Error('Squad view closed.'); };
      const state = denialState(client), sequence = state.sequence, prefix = actorPrefix(view);
      guard();
      let result = await manageMapSquad({ uid: view.account.user!.id, profileId: view.account.profile!.id }, { action: kind, ...(kind === 'read' ? { squadId: squadId! } : {}), ...(pageParam ? { cursor: pageParam } : {}) } as SquadRead, guard) as SquadPage | SquadDetail; guard();
      if (kind === 'read') {
        if (!(result as SquadDetail).squad) retireSquad(client, prefix, squadId!);
        if ((state.bySquad.get(`${prefix}${squadId}`) || 0) > sequence) result = { ...result, squad: null, members: [], nextCursor: null } as SquadDetail;
      } else result = { ...result, items: (result as SquadPage).items.filter(row => (state.bySquad.get(`${prefix}${row.id}`) || 0) <= sequence) } as SquadPage;
      return { ...result, readSequence: sequence };
    }, getNextPageParam: page => page.nextCursor || undefined,
  });
  const deadline = Math.min(...(query.data?.pages.map(page => page.validUntil) || [0]));
  const visible = useVisibility(deadline, key);
  const current = enabled && view.account.ready && visible && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData;
  const sequence = denialState(client).sequence, prefix = actorPrefix(view);
  const data = useMemo(() => current ? query.data?.pages.map(page => kind === 'list' ? { ...page, items: (page as SquadPage).items.filter(row => (denialState(client).bySquad.get(`${prefix}${row.id}`) || 0) <= page.readSequence) } : page) : undefined, [current, query.data, sequence, kind, prefix, client]);
  const nextGroup = (query.data?.pages.length || 0) >= 3;
  const more = async () => { view.guard(); if (nextGroup) { const cursor = query.data?.pages.at(-1)?.nextCursor; if (cursor) setWindow({ scope: view.scope, cursor }); } else await query.fetchNextPage(); };
  const restart = async () => { view.guard(); if (startCursor) setWindow({ scope: view.scope }); else await client.resetQueries({ queryKey: key, exact: true }); };
  return { ...query, data, nextGroup, fetchNextPage: more, restart, windowed: !!startCursor, isLoading: enabled && !data && !query.isError, guardCurrent: view.guard };
}
export function useSquadList(enabled = true) {
  const query = useSquadPages('list', undefined, enabled);
  const data = useMemo(() => query.data?.flatMap(page => (page as SquadPage).items).filter((row, index, rows) => rows.findIndex(other => other.id === row.id) === index), [query.data]);
  return { ...query, data };
}
export function useSquadRoster(squadId: string) {
  const query = useSquadPages('read', squadId, !!squadId);
  const denied = query.data?.some(page => !(page as SquadDetail).squad) ?? false;
  const data = useMemo(() => !denied ? query.data?.flatMap(page => (page as SquadDetail).members).filter((row, index, rows) => rows.findIndex(other => other.profile_id === row.profile_id) === index) : undefined, [query.data, denied]);
  return { ...query, data, isError: query.isError || denied };
}

export function useSquadAction(selection = '') {
  const view = useMapViewGuard(selection), client = useQueryClient();
  const operation = useMemo(() => ({ pending: false }), [view.scope]);
  type Input = SquadMutation | Extract<SquadRead, { action: 'previewInvite' }>;
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: async ({ input, extraGuard }: { input: Input; extraGuard?: () => void }) => {
      const guard = () => { view.guard(); extraGuard?.(); };
      guard(); if (operation.pending) throw new Error('A squad change is still being confirmed.'); operation.pending = true;
      try {
        guard();
        const result = await manageMapSquad({ uid: view.account.user!.id, profileId: view.account.profile!.id }, input, guard, { deferAcknowledgement: true }) as SquadReceipt | SquadPreview; guard();
        if (input.action !== 'previewInvite') {
          await Promise.all([client.cancelQueries({ queryKey: [LIST] }), client.cancelQueries({ queryKey: [DETAIL] })]); guard();
          await Promise.all([client.invalidateQueries({ queryKey: [LIST] }), client.invalidateQueries({ queryKey: [DETAIL] })]); guard();
          (result as SquadReceipt).acknowledge?.();
        }
        return result;
      } finally { operation.pending = false; }
    },
  });
  const reset = mutation.reset;
  useEffect(() => {
    const hidden = () => { if (document.visibilityState === 'hidden') reset(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { document.removeEventListener('visibilitychange', hidden); reset(); };
  }, [reset, view.scope]);
  return { ...mutation, mutateAsync: (input: Input, extraGuard?: () => void) => mutation.mutateAsync({ input, extraGuard }), guardCurrent: view.guard };
}
