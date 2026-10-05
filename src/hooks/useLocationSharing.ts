import { useEffect, useMemo, useReducer, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';
import { locationAttempt, locationSharingRequest, type LocationMutation, type LocationRead } from '@/lib/locationSharingService';

export function useLocationActor() {
  const account = useProfileAccount();
  return { uid: account.user?.id || '', profileId: account.profile?.id || '', epoch: account.session.epoch, ready: account.ready, guard: account.guard };
}
export const locationSharingKey = (actor: { uid: string; profileId: string; epoch: number }, targetId?: string) => ['location-sharing', actor.uid, actor.profileId, actor.epoch, targetId || null] as const;
type ReadResult = LocationRead & { validUntil: number; receivedAt: number };
export function useLocationSharing(targetId?: string, enabled = true) {
  const actor = useLocationActor(), client = useQueryClient();
  const [visibility, setVisibility] = useState(() => ({ visible: document.visibilityState !== 'hidden', revision: 0 }));
  const key = [...locationSharingKey(actor, targetId), visibility.revision];
  const scope = JSON.stringify(key);
  const [clockRevision, tick] = useReducer((n: number) => n + 1, 0);
  const query = useQuery({
    queryKey: key, enabled: actor.ready && enabled && visibility.visible,
    queryFn: async (): Promise<ReadResult> => {
      const started = performance.now();
      const received = await locationSharingRequest(actor, { action: 'read', ...(targetId ? { targetId } : {}) }, actor.guard) as LocationRead;
      actor.guard();
      const receivedAt = Date.now();
      const elapsed = Math.max(0, performance.now() - started);
      return { ...received, receivedAt: receivedAt - elapsed, validUntil: receivedAt + Math.max(0, Math.min(15_000, received.leaseUntil - received.serverTime) - elapsed) };
    },
    staleTime: 0, gcTime: 0, retry: false, placeholderData: undefined, refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchInterval: 15_000,
  });
  useEffect(() => {
    const change = () => {
      const visible = document.visibilityState !== 'hidden';
      // Remove hidden-page grants rather than painting them on foreground while
      // a new read is pending. Query cancellation also discards late old reads.
      void client.cancelQueries({ queryKey: key, exact: true });
      client.removeQueries({ queryKey: key, exact: true });
      setVisibility(value => ({ visible, revision: value.revision + 1 }));
    };
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  // This listener may only change the captured actor/target query.
  }, [client, scope]);
  const serverNow = query.data ? query.data.serverTime + Date.now() - query.data.receivedAt : Date.now();
  const deadlines = query.data ? [query.data.validUntil, ...query.data.locations.map(row => query.data!.receivedAt + Date.parse(row.expiresAt) - query.data!.serverTime), ...query.data.shares.filter(row => row.active).map(row => query.data!.receivedAt + Date.parse(row.expiresAt) - query.data!.serverTime), ...query.data.requests.filter(row => row.status === 'pending').map(row => query.data!.receivedAt + Date.parse(row.expiresAt) - query.data!.serverTime)] : [];
  const expiry = Math.min(...deadlines.filter(at => at > Date.now()));
  useEffect(() => {
    if (!Number.isFinite(expiry)) return;
    const delay = expiry - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(tick, delay + 5);
    return () => clearTimeout(timer);
  }, [expiry, scope]);
  let current = actor.ready && enabled && visibility.visible && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData && !!query.data && query.data.validUntil > Date.now();
  try { actor.guard(); } catch { current = false; }
  const data = useMemo(() => current && query.data ? {
    ...query.data,
    // Expired positions disappear on a timer, independently of the next poll.
    locations: query.data.locations.filter(row => Date.parse(row.expiresAt) > serverNow),
    shares: query.data.shares.map(row => Date.parse(row.expiresAt) <= serverNow ? { ...row, active: false } : row),
    requests: query.data.requests.map(row => row.status === 'pending' && Date.parse(row.expiresAt) <= serverNow ? { ...row, status: 'expired' as const } : row),
  } : undefined, [current, query.data, clockRevision, visibility.revision]);
  return { ...query, data, actor, isLoading: actor.ready && enabled && !data && !query.isError, isReady: !!data };
}

export function useLocationMutation(targetId?: string) {
  const actor = useLocationActor(), client = useQueryClient();
  const [, update] = useReducer((n: number) => n + 1, 0);
  const context = useMemo(() => ({ active: true, pending: false }), [actor.uid, actor.profileId, actor.epoch, targetId]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const mutation = useMutation({
    mutationFn: async (input: LocationMutation) => {
      const guard = () => { actor.guard(); if (!context.active) throw Object.assign(new Error('Open location sharing again to continue.'), { code: 'account-changed' }); };
      guard();
      if (context.pending) throw new Error('A location change is still saving.');
      context.pending = true; update();
      const attempt = locationAttempt(actor, input);
      try {
        const result = await locationSharingRequest(actor, attempt.body, guard);
        guard(); attempt.complete();
        await client.cancelQueries({ queryKey: ['location-sharing', actor.uid, actor.profileId, actor.epoch] });
        guard();
        // Acknowledgements can be historical replays. Only a fresh read supplies
        // current permission/state; never install an old receipt as current.
        await client.resetQueries({ queryKey: ['location-sharing', actor.uid, actor.profileId, actor.epoch] });
        guard();
        return result;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && /(^|\/)(aborted|already-exists|invalid-argument)$/.test(String(error.code))) attempt.complete();
        throw error;
      } finally { context.pending = false; if (context.active) update(); }
    },
  });
  const guardCurrent = () => { actor.guard(); if (!context.active) throw new Error('This location view changed.'); };
  return { ...mutation, isPending: context.pending, guardCurrent };
}
