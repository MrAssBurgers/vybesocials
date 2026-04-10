import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

export function useBackgroundLocation(userId?: string): LocationState {
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
    await supabase
      .from('user_locations')
      .upsert({
        user_id: userId,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        sharing_enabled: true,
        status,
        speed: spd,
      } as any, { onConflict: 'user_id' });
  }, [userId, sharing]);

  // watchPosition
  useEffect(() => {
    if (!sharing) return;
    let watchId: number | undefined;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setCoords(c);
          setAccuracy(pos.coords.accuracy);
          const spd = pos.coords.speed;
          setSpeed(spd);
          lastSpeed.current = spd;
          upsertLocation(c[0], c[1], pos.coords.accuracy, spd);
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          if (err.code === 1) {
            toast.error('Location permission denied');
            setSharing(false);
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } catch { /* geolocation not available */ }
    return () => { if (watchId !== undefined) navigator.geolocation.clearWatch(watchId); };
  }, [sharing, upsertLocation, setSharing]);

  // Disable sharing in DB when toggled off
  useEffect(() => {
    if (sharing || !userId) return;
    supabase.from('user_locations').update({ sharing_enabled: false } as any).eq('user_id', userId).then();
  }, [sharing, userId]);

  return { coords, accuracy, speed, sharing, setSharing };
}
