import { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { detectActivity } from '@/lib/vybemap/activity';
import { useLocationMutation, useLocationSharing } from './useLocationSharing';
import { locationSharingRequest, type LocationSharingState } from '@/lib/locationSharingService';

export interface LocationState {
  coords: [number, number] | null; accuracy: number | null; speed: number | null; heading: number | null;
  sharing: boolean; sharingEnabled: boolean; sharingPending: boolean; sharingReady: boolean; sharingError: string | null;
  legacySharingNeedsReview: boolean;
  locationAvailable: boolean; locationDenied: boolean; ghostUntil: number | null;
  setSharing: (v: boolean) => Promise<void>;
  requestLocation: () => void;
  enableTemporaryGhost: (ms: number) => Promise<void>;
  exitGhost: () => Promise<void>;
  retrySharing: () => void;
}
const EMPTY_POSITION = { coords: null as [number, number] | null, accuracy: null as number | null, speed: null as number | null, heading: null as number | null, denied: false };
async function optionalBatteryPercent(): Promise<number | null> {
  const read = (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery;
  if (!read) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const battery = await Promise.race([read.call(navigator), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); })]);
    return battery && Number.isFinite(battery.level) ? Math.max(0, Math.min(100, Math.round(battery.level * 100))) : null;
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}

export function useBackgroundLocation(userId?: string, options?: { watchOnMap?: boolean }): LocationState {
  const watchOnMap = options?.watchOnMap ?? false;
  const [ghost, setGhost] = useState<{ scope: string; until: number; revision: string } | null>(null);
  const read = useLocationSharing(undefined, watchOnMap || !!ghost);
  const change = useLocationMutation();
  const actor = read.actor;
  const ready = actor.ready && userId === actor.profileId;
  const scope = JSON.stringify([actor.uid, actor.profileId, actor.epoch]);
  const context = useMemo(() => ({ active: true, intent: 0, blocked: false, lastSent: 0, sending: false, failedIntent: null as boolean | null }), [scope]);
  useEffect(() => { context.active = true; return () => { context.active = false; context.intent++; }; }, [context]);
  const guard = useCallback(() => { actor.guard(); if (!ready || !context.active) throw Object.assign(new Error('Your account changed. Open the map again.'), { code: 'account-changed' }); }, [actor.guard, ready, context]);
  const [request, setRequest] = useState<{ scope: string; revision: number } | null>(null);
  const [position, setPosition] = useState({ ...EMPTY_POSITION, scope });
  const currentPosition = ready && position.scope === scope ? position : EMPTY_POSITION;
  const [problem, setProblem] = useState<{ scope: string; message: string } | null>(null);
  const [positionProblem, setPositionProblem] = useState<{ scope: string; message: string } | null>(null);
  const [published, setPublished] = useState<{ scope: string; revision: string; expiresAt: number } | null>(null);
  const latest = useRef({ state: read.data?.state, guard, scope, watchOnMap });
  latest.current = { state: read.data?.state, guard, scope, watchOnMap };
  const requestLocation = useCallback(() => {
    try {
      guard();
      setRequest(previous => ({ scope, revision: previous?.scope === scope ? previous.revision + 1 : 0 }));
    } catch { /* Auth not ready: no GPS request. */ }
  }, [guard, scope]);

  useEffect(() => {
    let active = true;
    if (watchOnMap && ready && navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'geolocation' }).then(permission => {
        try { latest.current.guard(); } catch { return; }
        if (active && permission.state === 'granted') {
          setRequest(previous => previous?.scope === scope ? previous : { scope, revision: 0 });
        }
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [watchOnMap, ready, scope]);

  const setSharing = useCallback(async (enabled: boolean, checkedState?: LocationSharingState) => {
    guard();
    const current = checkedState || read.data?.state;
    if (!current) throw new Error('Refresh location sharing before changing it.');
    context.intent++; context.blocked = true;
    setPublished(null); setGhost(null); setProblem(null);
    try {
      await change.mutateAsync({ action: 'setSharing', expectedRevision: current.revision, enabled });
      guard(); context.failedIntent = null; context.blocked = !enabled; context.lastSent = 0;
    } catch (error) {
      guard();
      context.failedIntent = enabled;
      setProblem({ scope, message: error instanceof Error ? error.message : 'Location sharing was not confirmed. Retry before assuming it stopped.' });
      throw error;
    }
  }, [guard, read.data, context, change.mutateAsync, scope]);
  const exitGhost = useCallback(() => setSharing(true), [setSharing]);
  const enableTemporaryGhost = useCallback(async (ms: number) => {
    if (!Number.isFinite(ms) || ms < 60_000 || ms > 24 * 60 * 60_000) throw new Error('Choose a valid Ghost duration.');
    await setSharing(false); guard();
    const fresh = await locationSharingRequest(actor, { action: 'read' }, guard);
    guard();
    if (!('state' in fresh) || !fresh.state || fresh.state.enabled || !fresh.state.revision) throw new Error('Check Ghost Mode again before scheduling a return.');
    setGhost({ scope, until: Date.now() + ms, revision: fresh.state.revision });
  }, [setSharing, actor, guard, scope]);

  useEffect(() => {
    if (!ghost || ghost.scope !== scope) return;
    let active = true;
    const resume = async () => {
      if (!active || document.visibilityState === 'hidden' || Date.now() < ghost.until) return;
      try {
        latest.current.guard();
        const result = await locationSharingRequest(actor, { action: 'read' }, latest.current.guard);
        latest.current.guard();
        if (!active || !('state' in result) || result.state?.revision !== ghost.revision || result.state.enabled) { if (active) setGhost(null); return; }
        await change.mutateAsync({ action: 'setSharing', expectedRevision: ghost.revision, enabled: true });
        latest.current.guard(); if (!active) return;
        context.blocked = false; context.lastSent = 0; setGhost(null);
        toast.success('Ghost timer ended. Location updates resume while the map is open.');
      } catch { if (active) { setGhost(null); setProblem({ scope, message: 'Automatic return was not confirmed. Check location sharing and retry.' }); } }
    };
    const timer = setTimeout(() => { void resume(); }, Math.max(0, ghost.until - Date.now()));
    const visible = () => { void resume(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [ghost, scope, context]);

  const publish = useCallback(async (pos: GeolocationPosition) => {
    const snapshot = latest.current;
    const state = snapshot.state;
    if (!state?.enabled || !state.revision || context.blocked || context.sending || !snapshot.watchOnMap || document.visibilityState === 'hidden') return;
    const sampledAt = pos.timestamp;
    if (!Number.isFinite(sampledAt) || Date.now() - sampledAt > 60_000 || sampledAt > Date.now() + 5000 || Date.now() - context.lastSent < 5000) return;
    const intent = context.intent;
    const check = () => {
      snapshot.guard();
      if (context.intent !== intent || context.blocked || !context.active || document.visibilityState === 'hidden' || !latest.current.watchOnMap || latest.current.scope !== snapshot.scope || latest.current.state?.revision !== state.revision || !latest.current.state?.enabled) throw new Error('Location update retired.');
    };
    context.sending = true; context.lastSent = Date.now();
    try {
      check();
      const batteryPercent = await optionalBatteryPercent();
      check();
      const receipt = await locationSharingRequest(actor, { action: 'publishPosition', requestId: crypto.randomUUID(), sharingRevision: state.revision, sampledAt, latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy, speed: pos.coords.speed, heading: pos.coords.heading, batteryPercent, activityType: detectActivity(pos.coords.speed) }, check);
      check();
      if ('expiresAt' in receipt && receipt.expiresAt) setPublished({ scope: snapshot.scope, revision: state.revision, expiresAt: Date.parse(receipt.expiresAt) });
      setProblem(null);
    } catch (error) {
      try { check(); } catch { return; }
      setPublished(null);
      setProblem({ scope: snapshot.scope, message: error instanceof Error ? error.message : 'Location update was not confirmed.' });
    } finally { context.sending = false; }
  }, [actor.uid, actor.profileId, context]);

  const shouldWatch = ready && watchOnMap && request?.scope === scope;
  useEffect(() => {
    if (!shouldWatch) return;
    if (!navigator.geolocation) {
      setPositionProblem({ scope, message: 'Location is unavailable on this device.' });
      return;
    }
    let active = true, fellBack = false;
    let watchRevision = 0;
    let watchId: number | undefined;
    const current = (revision: number) => { try { latest.current.guard(); return active && revision === watchRevision && document.visibilityState !== 'hidden' && latest.current.scope === scope; } catch { return false; } };
    const success = (pos: GeolocationPosition, revision: number) => {
      if (!current(revision)) return;
      const { latitude, longitude, accuracy, speed, heading } = pos.coords;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return;
      setPosition({ scope, coords: [latitude, longitude], accuracy, speed, heading: heading != null && Number.isFinite(heading) ? heading : null, denied: false });
      setPositionProblem(null);
      void publish(pos);
    };
    const failure = (error: GeolocationPositionError, revision: number) => {
      if (!current(revision)) return;
      if (error.code === 1) {
        context.intent++; setPublished(null);
        setPosition({ ...EMPTY_POSITION, scope, denied: true });
        setPositionProblem({ scope, message: 'Location permission is denied. New updates stopped; a previously shared position expires within two minutes. Use Ghost Mode to stop access now.' });
      } else if (!fellBack && (error.code === 2 || error.code === 3)) {
        fellBack = true;
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        const fallbackRevision = ++watchRevision;
        watchId = navigator.geolocation.watchPosition(pos => success(pos, fallbackRevision), error => failure(error, fallbackRevision), { enableHighAccuracy: false, maximumAge: 30_000, timeout: 30_000 });
      } else if (error.code === 2 || error.code === 3) {
        setPositionProblem({ scope, message: 'Your device could not get a location. Check location services and try again.' });
      }
    };
    const start = () => {
      if (document.visibilityState === 'hidden') return;
      fellBack = false;
      const revision = ++watchRevision;
      navigator.geolocation.getCurrentPosition(pos => success(pos, revision), error => failure(error, revision), { enableHighAccuracy: false, timeout: 10_000, maximumAge: 30_000 });
      watchId = navigator.geolocation.watchPosition(pos => success(pos, revision), error => failure(error, revision), { enableHighAccuracy: true, maximumAge: 4000, timeout: 20_000 });
    };
    const visibility = () => {
      watchRevision++; context.intent++; setPublished(null);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = undefined;
      if (document.visibilityState !== 'hidden') start();
    };
    try { start(); } catch { setPositionProblem({ scope, message: 'Location is unavailable on this device.' }); }
    document.addEventListener('visibilitychange', visibility);
    return () => { active = false; context.intent++; document.removeEventListener('visibilitychange', visibility); if (watchId !== undefined) navigator.geolocation.clearWatch(watchId); };
  }, [shouldWatch, request?.revision, scope, context, publish]);
  // A stationary device may not emit watch callbacks. Refresh an approved share
  // using actual fresh samples before its two-minute server expiry; never extend
  // an old coordinate's timestamp or request location while backgrounded.
  useEffect(() => {
    let active = true;
    if (!shouldWatch || !read.data?.state.enabled || currentPosition.denied) return;
    let waiting = false, sequence = 0;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const requestFresh = () => {
      if (!active || waiting || context.blocked || !latest.current.state?.enabled || document.visibilityState === 'hidden') return;
      try { latest.current.guard(); } catch { return; }
      const intent = context.intent, requestSequence = ++sequence;
      waiting = true;
      deadline = setTimeout(() => { waiting = false; sequence++; }, 11_000);
      const finish = (pos?: GeolocationPosition) => {
        if (!active || requestSequence !== sequence) return;
        waiting = false; clearTimeout(deadline);
        try {
          latest.current.guard();
          if (pos && context.intent === intent && latest.current.scope === scope && document.visibilityState !== 'hidden') void publish(pos);
        } catch { /* Retired account or location request. */ }
      };
      try { navigator.geolocation?.getCurrentPosition(pos => finish(pos), () => finish(), { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }); }
      catch { finish(); }
    };
    const visible = () => {
      sequence++; waiting = false; clearTimeout(deadline);
      if (document.visibilityState !== 'hidden') requestFresh();
    };
    requestFresh();
    const interval = setInterval(requestFresh, 45_000);
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; sequence++; clearTimeout(deadline); clearInterval(interval); document.removeEventListener('visibilitychange', visible); };
  }, [read.data?.state.revision, shouldWatch, request?.revision, currentPosition.denied, context, scope, publish]);

  const sharingEnabled = !!read.data?.state.enabled && ready;
  return {
    ...currentPosition, locationDenied: currentPosition.denied,
    sharingEnabled, sharing: sharingEnabled && published?.scope === scope && published.revision === read.data?.state.revision && published.expiresAt > Date.now(),
    sharingPending: change.isPending, sharingReady: !!read.data, sharingError: problem?.scope === scope ? problem.message : positionProblem?.scope === scope ? positionProblem.message : read.error?.message || null,
    legacySharingNeedsReview: read.data?.legacySharingNeedsReview ?? false,
    locationAvailable: !!currentPosition.coords && !currentPosition.denied,
    ghostUntil: ghost?.scope === scope ? ghost.until : null,
    setSharing, requestLocation, enableTemporaryGhost, exitGhost, retrySharing: () => {
      void (async () => {
        try {
          guard(); const result = await read.refetch(); guard();
          if (result.error || !result.data) throw result.error || new Error('Location sharing could not be checked.');
          if (context.failedIntent !== null) await setSharing(context.failedIntent, result.data.state);
          else setProblem(null);
          if (positionProblem?.scope === scope && request?.scope === scope) requestLocation();
        } catch (error) {
          try { guard(); } catch { return; }
          setProblem({ scope, message: error instanceof Error ? error.message : 'Location sharing was not confirmed.' });
        }
      })();
    },
  };
}
