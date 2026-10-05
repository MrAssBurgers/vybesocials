import { useCallback, useRef } from 'react';
// Type-only import — erased at build so this module never pulls mapbox-gl
// (~1MB) into the page chunk. The canvas itself is lazy-loaded.
import type mapboxgl from 'mapbox-gl';
import { pitchForMode, type MapViewMode } from '@/lib/vybemap/mapbox/config';

export function useVybeMapFlyTo(mode: MapViewMode) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setMap = useCallback((map: mapboxgl.Map | null) => { mapRef.current = map; }, []);
  /** Instant jump to a point of interest — no slow fly animation (Teleport / search). */
  const flyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fire('vybe:pause-follow'); } catch { /* custom event */ }
    // jumpTo is frame-sync; avoids 1.2s freezes on Fold / mid/low GPUs.
    map.jumpTo({ center: [lng, lat], zoom });
  }, []);
  /** Recenter on the user — short ease so it still feels responsive. */
  const flyToUser = useCallback((lat: number, lng: number, zoom = 15) => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fire('vybe:resume-follow'); } catch { /* custom event */ }
    map.easeTo({ center: [lng, lat], zoom, pitch: pitchForMode(mode), duration: 220, essential: true });
  }, [mode]);
  /** Wander: unlock camera, widen slightly for free exploration. */
  const startWander = useCallback((lat?: number, lng?: number) => {
    const map = mapRef.current;
    if (!map) return;
    try { map.fire('vybe:pause-follow'); } catch { /* custom event */ }
    const center = lat != null && lng != null ? ([lng, lat] as [number, number]) : map.getCenter().toArray() as [number, number];
    const zoom = Math.min(map.getZoom(), 12.5);
    map.easeTo({
      center,
      zoom,
      bearing: 0,
      pitch: pitchForMode(mode),
      duration: 180,
      essential: true,
    });
  }, [mode]);
  const resetBearing = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: pitchForMode(mode), duration: 180 });
  }, [mode]);
  return { setMap, flyTo, flyToUser, startWander, resetBearing };
}
