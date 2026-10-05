import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { encodeGeohash } from '@/lib/vybemap/geohash';
import { detectActivity } from '@/lib/vybemap/activity';
import { upsertLiveLocation, disableLiveLocation, appendLocationHistory } from '@/lib/vybemap/firestore';
import {
  persistGhostUntil,
  persistSharingPref,
  resolveSharingOnLoad,
} from '@/lib/vybemap/ghostMode';

const UPSERT_INTERVAL_MS = 5_000;
const HISTORY_INTERVAL_MS = 60_000;

function autoStatus(speed: number | null, hour: number): string | null {
  if (speed && speed > 25) return '✈️ Traveling';
  if (speed && speed > 2) return '🚗 Driving';
  if (speed && speed > 0.5) return '🚶 Walking';
  if (hour >= 0 && hour < 6) return '😴 Sleeping';
  return null;
}

export interface LocationState {
  coords: [number, number] | null;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  sharing: boolean;
  /** True only after this session has a usable position and permission is not denied. */
  locationAvailable: boolean;
  locationDenied: boolean;
  /** Epoch ms when temporary ghost ends; null if live or permanent ghost. */
  ghostUntil: number | null;
  setSharing: (v: boolean) => void;
  /** Existing map controls may ask for position; mounting the map never prompts. */
  requestLocation: () => void;
  /** Hide for `ms` then auto-restore. Survives leaving /map. */
  enableTemporaryGhost: (ms: number) => void;
  exitGhost: () => void;
}

export function useBackgroundLocation(
  userId?: string,
  options?: { watchOnMap?: boolean },
): LocationState {
  const watchOnMap = options?.watchOnMap ?? false;
  const [request, setRequest] = useState<{ userId?: string; allowed: boolean }>({ userId, allowed: false });
  const locationRequested = request.userId === userId && request.allowed;
  const requestLocation = useCallback(() => { setRequest({ userId, allowed: true }); }, [userId]);
  useEffect(() => {
    let active = true;
    // Reading the permission state does not request GPS or prompt the user.
    // Preserve already-granted map watchers, but require a gesture for prompt.
    if (watchOnMap && userId && navigator.permissions?.query) {
      void navigator.permissions.query({ name: 'geolocation' }).then(permission => {
        if (active && permission.state === 'granted') setRequest({ userId, allowed: true });
      }).catch(() => {});
    }
    return () => { active = false; };
  }, [watchOnMap, userId]);
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const initial = resolveSharingOnLoad();
  const [sharing, setSharingState] = useState(initial.sharing);
  const [ghostUntil, setGhostUntil] = useState<number | null>(initial.ghostUntil);
  const lastUpsert = useRef(0);
  const lastHistory = useRef(0);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastSpeed = useRef<number | null>(null);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const denialNotifiedRef = useRef(false);

  const clearGhostTimer = useCallback(() => {
    if (ghostTimerRef.current) {
      clearTimeout(ghostTimerRef.current);
      ghostTimerRef.current = null;
    }
  }, []);

  const exitGhost = useCallback(() => {
    clearGhostTimer();
    persistGhostUntil(null);
    setGhostUntil(null);
    setSharingState(true);
    persistSharingPref(true);
  }, [clearGhostTimer]);

  const setSharing = useCallback((v: boolean) => {
    clearGhostTimer();
    persistGhostUntil(null);
    setGhostUntil(null);
    setSharingState(v);
    persistSharingPref(v);
  }, [clearGhostTimer]);

  const enableTemporaryGhost = useCallback((ms: number) => {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const until = Date.now() + ms;
    persistGhostUntil(until);
    setGhostUntil(until);
    setSharingState(false);
    persistSharingPref(false);
  }, []);

  // Restore from temporary ghost when `ghostUntil` elapses (survives leaving /map).
  useEffect(() => {
    if (ghostUntil == null) {
      clearGhostTimer();
      return;
    }
    const remaining = ghostUntil - Date.now();
    if (remaining <= 0) {
      exitGhost();
      toast.success("You're live on VybeMap again");
      return;
    }
    clearGhostTimer();
    ghostTimerRef.current = setTimeout(() => {
      ghostTimerRef.current = null;
      persistGhostUntil(null);
      setGhostUntil(null);
      setSharingState(true);
      persistSharingPref(true);
      toast.success("You're live on VybeMap again");
    }, remaining);
    return () => clearGhostTimer();
  }, [ghostUntil, exitGhost, clearGhostTimer]);
  // Upsert to DB
  const upsertLocation = useCallback(async (lat: number, lng: number, acc: number, spd: number | null, heading?: number | null) => {
    if (!userId || !sharing) return;
    const now = Date.now();
    const moving = spd != null && spd > 0.5;
    const minInterval = moving ? 3_000 : UPSERT_INTERVAL_MS;
    if (now - lastUpsert.current < minInterval) return;
    lastUpsert.current = now;
    const hour = new Date().getHours();
    const status = autoStatus(spd, hour);
    const activity_type = detectActivity(spd, status);
    const geohash = encodeGeohash(lat, lng, 7);
    let battery_percent: number | undefined;
    try {
      const bat = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery?.();
      if (bat) battery_percent = Math.round(bat.level * 100);
    } catch { /* unsupported */ }

    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString();
    await upsertLiveLocation(userId, {
      user_id: userId,
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      sharing_enabled: true,
      is_ghost: false,
      status,
      speed: spd,
      heading: heading ?? null,
      activity_type,
      geohash,
      battery_percent: battery_percent ?? null,
      expires_at: expiresAt,
      sharing_mode: 'friends',
    });

    if (now - lastHistory.current > HISTORY_INTERVAL_MS) {
      lastHistory.current = now;
      void appendLocationHistory(userId, {
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        speed: spd,
        heading: heading ?? null,
        activity_type,
        geohash,
      });
    }

    lastPos.current = { lat, lng };
  }, [userId, sharing]);

  // Request GPS only while the user is on VybeMap (location feature), never on cold start /
  // Home / Feed. Sharing still controls whether we upsert live location while watching.
  const shouldWatch = Boolean(userId) && watchOnMap && locationRequested;

  useEffect(() => {
    if (!shouldWatch || !('geolocation' in navigator)) return;
    let active = true;
    let watchId: number | undefined;
    let fallbackWatchId: number | undefined;
    let fellBack = false;

    const watchOpts = (): PositionOptions => ({
      enableHighAccuracy: document.visibilityState !== 'hidden',
      maximumAge: document.visibilityState === 'hidden' ? 25_000 : sharing ? 4_000 : 8_000,
      timeout: 20_000,
    });

    const onSuccess = (pos: GeolocationPosition) => {
      if (!active) return;
      const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setCoords(c);
      setLocationDenied(false);
      setAccuracy(pos.coords.accuracy);
      const spd = pos.coords.speed;
      setSpeed(spd);
      lastSpeed.current = spd;
      const h = pos.coords.heading;
      if (h != null && Number.isFinite(h)) setHeading(h);
      upsertLocation(c[0], c[1], pos.coords.accuracy, spd, h);
    };

    const onError = (err: GeolocationPositionError) => {
      if (!active) return;
      console.warn('[Geolocation] error:', err.code, err.message);
      if (err.code === 1) {
        // Permission denied — toast once. Do NOT flip Ghost Mode / sharing pref.
        setLocationDenied(true);
        setCoords(null);
        if (userId) {
          void disableLiveLocation(userId);
        }
        if (!denialNotifiedRef.current) {
          denialNotifiedRef.current = true;
          toast.error('Location permission denied — enable it in Settings to share on the map', {
            id: 'vybe-map-location-denied',
          });
        }
        return;
      }
      // TIMEOUT (3) or POSITION_UNAVAILABLE (2): retry with low accuracy.
      // Common on Macs / desktops without GPS where high-accuracy WiFi lookup stalls.
      if (!fellBack && (err.code === 2 || err.code === 3)) {
        fellBack = true;
        try {
          // One-shot first to populate quickly
          navigator.geolocation.getCurrentPosition(onSuccess, (e) => {
            console.warn('[Geolocation] fallback one-shot failed:', e.code, e.message);
          }, { enableHighAccuracy: false, timeout: 30000, maximumAge: 5 * 60 * 1000 });
          // Then keep watching at low accuracy
          fallbackWatchId = navigator.geolocation.watchPosition(onSuccess, (e) => {
            console.warn('[Geolocation] fallback watch error:', e.code, e.message);
          }, { enableHighAccuracy: false, maximumAge: 60_000, timeout: 30000 });
        } catch (e) {
          console.warn('[Geolocation] fallback threw:', e);
        }
      }
    };

    try {
      // Quick one-shot so the dot appears ASAP
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      });
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, watchOpts());
    } catch { /* geolocation not available */ }

    const onVisibility = () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, watchOpts());
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (fallbackWatchId !== undefined) navigator.geolocation.clearWatch(fallbackWatchId);
    };
  }, [shouldWatch, sharing, upsertLocation, userId]);

  // Disable sharing in DB when toggled off
  useEffect(() => {
    if (sharing || !userId) return;
    void disableLiveLocation(userId);
  }, [sharing, userId]);

  // Push location immediately when sharing is turned on (don't wait for 15s throttle).
  useEffect(() => {
    if (!sharing || !userId || !coords) return;
    lastUpsert.current = 0;
    void upsertLocation(coords[0], coords[1], accuracy ?? 50, speed);
  }, [sharing, userId, coords, accuracy, speed, upsertLocation]);

  return {
    coords,
    accuracy,
    speed,
    heading,
    sharing,
    locationAvailable: coords !== null && !locationDenied,
    locationDenied,
    ghostUntil,
    setSharing,
    requestLocation,
    enableTemporaryGhost,
    exitGhost,
  };
}
