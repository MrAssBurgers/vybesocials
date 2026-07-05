import { useCallback, useRef } from 'react';
// Type-only import — erased at build so this module never pulls mapbox-gl
// (~1MB) into the page chunk. The canvas itself is lazy-loaded.
import type mapboxgl from 'mapbox-gl';
import { pitchForMode } from '@/lib/vybemap/mapbox/config';

export function useVybeMapFlyTo() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setMap = useCallback((map: mapboxgl.Map) => { mapRef.current = map; }, []);
  /** Fly to a point of interest — GPS follow stays off so the camera doesn't fight back. */
  const flyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fire('vybe:pause-follow'); } catch { /* custom event */ }
    map.flyTo({ center: [lng, lat], zoom, duration: 1200, essential: true });
  }, []);
  /** Recenter on the user and re-engage GPS follow (recenter button only). */
  const flyToUser = useCallback((lat: number, lng: number, zoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fire('vybe:resume-follow'); } catch { /* custom event */ }
    map.flyTo({ center: [lng, lat], zoom, duration: 1200, essential: true });
  }, []);
  const resetBearing = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: pitchForMode('2d'), duration: 600 });
  }, []);
  return { setMap, flyTo, flyToUser, resetBearing };
}
