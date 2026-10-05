import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useMapViewGuard } from './useMapSocial';
import { sendMapWave } from '@/lib/vybemap/mapSocial';
import type { LiveFriend } from '@/lib/vybemap/types';

/** A wave is an acknowledged in-app notification, not a location-sharing action. */
export function useMapWave(friend: LiveFriend | null, selectedProfileId: string | null = friend?.user_id || null) {
  const visibility = useRef(0), [visibleEpoch, refreshVisibility] = useReducer(n => n + 1, 0);
  const admitted = friend?.user_id === selectedProfileId && !!friend?.accessRevision && (friend.accessUntil || 0) > Date.now() && document.visibilityState !== 'hidden';
  const view = useMapViewGuard(`wave:${selectedProfileId || ''}:${friend?.user_id || ''}:${friend?.accessRevision || ''}:${admitted}:${visibleEpoch}`);
  const viewId = useMemo(() => Symbol(), [view.scope]);
  // Current admission can disappear during a read renewal. Keep only already
  // acknowledged, non-location feedback for the same selected account/grant.
  // Requests themselves still use the stricter admitted-view lifetime above.
  const selectedScope = `${view.account.user?.id}:${view.account.profile?.id}:${view.account.session.epoch}:${selectedProfileId}:${visibleEpoch}`;
  const feedback = useRef({ scope: selectedScope, revision: friend?.accessRevision, id: Symbol() });
  if (feedback.current.scope !== selectedScope || (friend?.accessRevision && friend.accessRevision !== feedback.current.revision)) {
    feedback.current = { scope: selectedScope, revision: friend?.accessRevision, id: Symbol() };
  }
  const feedbackId = feedback.current.id;
  const latest = useRef(friend); latest.current = friend;
  const pending = useRef<{ viewId: symbol; token: symbol } | null>(null);
  const [state, setState] = useState({ viewId, feedbackId, pending: false, error: '', cooldownUntil: 0 });
  const [confirmed, setConfirmed] = useState<{ feedbackId: symbol; message: string; cooldownUntil: number } | null>(null);
  const [, tick] = useReducer(n => n + 1, 0);
  useEffect(() => {
    const retire = () => { visibility.current++; refreshVisibility(); };
    document.addEventListener('visibilitychange', retire); window.addEventListener('pagehide', retire);
    return () => { visibility.current++; document.removeEventListener('visibilitychange', retire); window.removeEventListener('pagehide', retire); };
  }, []);
  const currentState = state.viewId === viewId ? state : null;
  const accessAvailable = view.account.ready && admitted;
  const confirmedState = accessAvailable && confirmed?.feedbackId === feedbackId ? confirmed : null;
  const cooldownSeconds = Math.max(0, Math.ceil((Math.max(currentState?.cooldownUntil || 0, confirmedState?.cooldownUntil || 0) - Date.now()) / 1000));
  const interrupted = accessAvailable && state.pending && !currentState && state.feedbackId === feedbackId;
  useEffect(() => {
    if (!friend) return;
    const access = Math.max(0, (friend.accessUntil || 0) - Date.now());
    if (!access && !cooldownSeconds) return;
    const timer = setTimeout(tick, Math.min(access || 1000, cooldownSeconds ? 1000 : 2_147_483_647));
    return () => clearTimeout(timer);
  }, [friend, friend?.accessUntil, cooldownSeconds]);

  const send = async () => {
    if (!friend || pending.current?.viewId === viewId || cooldownSeconds) return;
    const token = Symbol(), friendId = friend.user_id, revision = friend.accessRevision, visibilityAtStart = visibility.current;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    const visible = () => {
      view.guard();
      if (visibility.current !== visibilityAtStart || document.visibilityState === 'hidden') throw new Error('The map view changed. Please try again.');
    };
    const guard = () => {
      visible();
      const current = latest.current;
      if (!active || !revision || selectedProfileId !== friendId || current?.user_id !== friendId || current.accessRevision !== revision || (current.accessUntil || 0) <= Date.now()) throw new Error('Refresh this friend before sending a wave.');
    };
    try {
      guard(); pending.current = { viewId, token }; setConfirmed(null); setState({ viewId, feedbackId, pending: true, error: '', cooldownUntil: 0 });
      const result = await Promise.race([
        sendMapWave({ uid: view.account.user!.id, profileId: view.account.profile!.id }, { targetProfileId: friendId, expectedAccessRevision: revision! }, guard),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { active = false; reject(new Error('Sending the wave took too long. Please retry.')); }, 15_000); }),
      ]);
      guard(); result.acknowledge();
      setConfirmed({ feedbackId, message: result.replayed ? 'Your earlier wave was sent.' : 'Wave sent.', cooldownUntil: result.cooldownUntil });
      setState({ viewId, feedbackId, pending: false, error: '', cooldownUntil: 0 });
    } catch (error) {
      try {
        visible();
        if (latest.current?.user_id !== friendId || latest.current?.accessRevision !== revision) return;
        const cooldownUntil = error instanceof Error && 'cooldownUntil' in error && typeof error.cooldownUntil === 'number' ? error.cooldownUntil : 0;
        setState({ viewId, feedbackId, pending: false, error: error instanceof Error ? error.message : 'The wave could not be sent. Please retry.', cooldownUntil });
      } catch { /* A hidden, closed or replacement view cannot accept this result. */ }
    } finally {
      active = false; if (timer) clearTimeout(timer);
      if (pending.current?.token === token) pending.current = null;
    }
  };
  return { send, isPending: !!currentState?.pending, error: currentState?.error || (interrupted ? 'Map access refreshed before the wave was confirmed. Retry to check its status.' : ''), message: confirmedState?.message || '', cooldownSeconds, isAvailable: accessAvailable };
}
