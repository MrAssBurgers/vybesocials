import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchLocationIntel, type LocationIntelInput } from '@/lib/vybemap/locationIntel';
import { useProfileAccount } from '@/hooks/useProfileAccount';

export function useLocationIntel(opts: LocationIntelInput & { enabled?: boolean }) {
  const { latitude, longitude, placeName, placeId, enabled = true } = opts;
  const account = useProfileAccount(), client = useQueryClient();
  const [visibility, setVisibility] = useState({ visible: document.visibilityState !== 'hidden', epoch: 0 });
  const scope = JSON.stringify([account.user?.id, account.profile?.id, account.session.epoch, latitude, longitude, placeName, placeId, enabled, visibility.epoch]);
  const view = useMemo(() => ({ active: true }), [scope]);
  const latest = useRef(view); latest.current = view;
  const key = ['vybemap-location-intel', scope] as const;
  const [forced, setForced] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ scope: string; error: Error } | null>(null);
  const [settledScope, setSettledScope] = useState('');
  const pending = useRef<{ view: typeof view; token: symbol } | null>(null);
  const [, tick] = useReducer(value => value + 1, 0);
  const guard = () => {
    account.guard();
    if (!enabled || !view.active || latest.current !== view || document.visibilityState === 'hidden') throw new Error('This map view changed. Open it again.');
  };
  useEffect(() => { view.active = true; return () => { view.active = false; }; }, [view]);
  useEffect(() => {
    const change = () => {
      view.active = false;
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
      setVisibility(previous => ({ visible: document.visibilityState !== 'hidden', epoch: previous.epoch + 1 }));
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [client, scope, view]);
  useEffect(() => {
    if (placeId) return;
    const timer = setTimeout(() => setSettledScope(scope), 500); return () => clearTimeout(timer);
  }, [scope, placeId]);
  const active = enabled && account.ready && visibility.visible && Number.isFinite(latitude) && Number.isFinite(longitude);
  const settled = !!placeId || settledScope === scope;
  const query = useQuery({
    queryKey: key, enabled: active && settled && forced !== scope, placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const current = () => { guard(); if (signal.aborted) throw new Error('This area information request was cancelled.'); };
      const result = await fetchLocationIntel({ uid: account.user!.id, profileId: account.profile!.id }, { latitude, longitude, placeName, placeId }, current);
      current(); return result;
    },
    staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: state => state.state.error ? false : 10_000,
  });
  const deadline = query.data?.validUntil;
  useEffect(() => {
    if (!active || !deadline || deadline <= Date.now()) return;
    const timer = setTimeout(tick, deadline - Date.now() + 1); return () => clearTimeout(timer);
  }, [active, deadline, scope]);
  const manualError = failure?.scope === scope ? failure.error : null;
  const current = active && !manualError && !query.isError && !query.isPlaceholderData && query.isFetchedAfterMount && !!query.data && query.data.validUntil > Date.now();
  const refreshIntel = async () => {
    if (pending.current?.view === view || !active || !settled) return;
    const token = Symbol(); pending.current = { view, token };
    try {
      guard(); setForced(scope); setFailure(null);
      await client.cancelQueries({ queryKey: key, exact: true }); guard();
      const fresh = await fetchLocationIntel({ uid: account.user!.id, profileId: account.profile!.id }, {
        latitude, longitude, placeName, placeId, forceRefresh: !query.isError && !manualError,
      }, guard);
      guard(); client.setQueryData(key, fresh);
    } catch (error) {
      try { guard(); setFailure({ scope, error: error instanceof Error ? error : new Error('Area information could not be loaded. Please retry.') }); } catch { /* Retired account/view. */ }
    } finally {
      if (pending.current?.token === token) { pending.current = null; setForced(null); }
    }
  };
  return { ...query, data: current ? query.data!.intel : undefined, error: manualError || query.error,
    isLoading: active && (forced === scope || (!current && !manualError && !query.isError)),
    isFailed: active && (!!manualError || query.isError), refreshIntel };
}
