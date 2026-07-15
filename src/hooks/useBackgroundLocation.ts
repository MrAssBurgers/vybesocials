import { useEffect, useRef, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { encodeGeohash } from '@/lib/vybemap/geohash';
import { detectActivity } from '@/lib/vybemap/activity';
import { upsertLiveLocation, disableLiveLocation, appendLocationHistory } from '@/lib/vybemap/firestore';

const UPSERT_INTERVAL_MS = 5_000;
const HISTORY_INTERVAL_MS = 60_000;
const SHARING_PREF_KEY = 'vybe-map-sharing';

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
  setSharing: (v: boolean) => void;
}

export function useBackgroundLocation(
  userId?: string,
  options?: { watchOnMap?: boolean },
): LocationState {
  const watchOnMap = options?.watchOnMap ?? false;
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [sharing, setSharingState] = useState(() => {
    const stored = localStorage.getItem(SHARING_PREF_KEY);
    // Default visible on map — users opt into Ghost Mode, not opt out of sharing.
    if (stored === null) return true;
    return stored === 'true';
  });
  const lastUpsert = useRef(0);
  const lastHistory = useRef(0);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const lastSpeed = useRef<number | null>(null);

  const setSharing = useCallback((v: boolean) => {
    setSharingState(v);
    localStorage.setItem(SHARING_PREF_KEY, String(v));
  }, []);

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

  // Snap-style: keep GPS warm while live on map OR viewing VybeMap (ghost still needs self dot).
  // Defer cold-start GPS until after first paint so Conversations/images aren't blocked by geolocation.
  const shouldWatch = Boolean(userId) && (sharing || watchOnMap);
  const [gpsReady, setGpsReady] = useState(() => watchOnMap);

  useEffect(() => {
    if (!shouldWatch) {
      setGpsReady(false);
      return;
    }
    if (watchOnMap) {
      setGpsReady(true);
      return;
    }
    let cancelled = false;
    const arm = () => {
      if (!cancelled) setGpsReady(true);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(arm, { timeout: 2500 });
      return () => {
        cancelled = true;
        if (typeof window.cancelIdleCallback === 'function') {
          window.cancelIdleCallback(id);
        } else {
          clearTimeout(id);
        }
      };
    }
    const t = setTimeout(arm, 1800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [shouldWatch, watchOnMap]);

  useEffect(() => {
    if (!shouldWatch || !gpsReady || !('geolocation' in navigator)) return;
    let watchId: number | undefined;
    let fallbackWatchId: number | undefined;
    let fellBack = false;

    const watchOpts = (): PositionOptions => ({
      enableHighAccuracy: document.visibilityState !== 'hidden',
      maximumAge: document.visibilityState === 'hidden' ? 25_000 : sharing ? 4_000 : 8_000,
      timeout: 20_000,
    });

    const onSuccess = (pos: GeolocationPosition) => {
      const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setCoords(c);
      setAccuracy(pos.coords.accuracy);
      const spd = pos.coords.speed;
      setSpeed(spd);
      lastSpeed.current = spd;
      const h = pos.coords.heading;
      if (h != null && Number.isFinite(h)) setHeading(h);
      upsertLocation(c[0], c[1], pos.coords.accuracy, spd, h);
    };

    const onError = (err: GeolocationPositionError) => {
      console.warn('[Geolocation] error:', err.code, err.message);
      if (err.code === 1) {
        // Permission denied — only toast/disable sharing if user had it on.
        if (sharing) {
          toast.error('Location permission denied');
          setSharing(false);
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
      document.removeEventListener('visibilitychange', onVisibility);
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (fallbackWatchId !== undefined) navigator.geolocation.clearWatch(fallbackWatchId);
    };
  }, [shouldWatch, gpsReady, sharing, upsertLocation, setSharing]);

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

  return { coords, accuracy, speed, heading, sharing, setSharing };
}
