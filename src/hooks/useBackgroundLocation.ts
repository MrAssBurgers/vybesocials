import { useEffect, useRef, useCallback, useState } from 'react';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

const UPSERT_INTERVAL_MS = 15_000;
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
  sharing: boolean;
  setSharing: (v: boolean) => void;
}

export function useBackgroundLocation(
  userId?: string,
  options?: { watchPosition?: boolean },
): LocationState {
  const watchPosition = options?.watchPosition ?? false;
  const [coords, setCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [sharing, setSharingState] = useState(() => localStorage.getItem(SHARING_PREF_KEY) === 'true');
  const lastUpsert = useRef(0);
  const lastSpeed = useRef<number | null>(null);

  const setSharing = useCallback((v: boolean) => {
    setSharingState(v);
    localStorage.setItem(SHARING_PREF_KEY, String(v));
  }, []);

  // Upsert to DB
  const upsertLocation = useCallback(async (lat: number, lng: number, acc: number, spd: number | null) => {
    if (!userId || !sharing) return;
    const now = Date.now();
    if (now - lastUpsert.current < UPSERT_INTERVAL_MS) return;
    lastUpsert.current = now;
    const hour = new Date().getHours();
    const status = autoStatus(spd, hour);
    const expiresAt = new Date(now + 60 * 60 * 1000).toISOString(); // 1 hour from now
    await db
      .from('user_locations')
      .upsert({
        user_id: userId,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        sharing_enabled: true,
        status,
        speed: spd,
        expires_at: expiresAt,
      } as any, { onConflict: 'user_id' });
  }, [userId, sharing]);

  // Only watch GPS on map routes (or when caller explicitly opts in). Never prompt on app boot.
  useEffect(() => {
    if (!watchPosition || !('geolocation' in navigator)) return;
    let watchId: number | undefined;
    let fallbackWatchId: number | undefined;
    let fellBack = false;

    const onSuccess = (pos: GeolocationPosition) => {
      const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
      setCoords(c);
      setAccuracy(pos.coords.accuracy);
      const spd = pos.coords.speed;
      setSpeed(spd);
      lastSpeed.current = spd;
      upsertLocation(c[0], c[1], pos.coords.accuracy, spd);
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
      watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      });
    } catch { /* geolocation not available */ }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      if (fallbackWatchId !== undefined) navigator.geolocation.clearWatch(fallbackWatchId);
    };
  }, [watchPosition, sharing, upsertLocation, setSharing]);

  // Disable sharing in DB when toggled off
  useEffect(() => {
    if (sharing || !userId) return;
    db.from('user_locations').update({ sharing_enabled: false } as any).eq('user_id', userId).then();
  }, [sharing, userId]);

  return { coords, accuracy, speed, sharing, setSharing };
}
