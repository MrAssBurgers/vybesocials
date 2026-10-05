import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DEFAULT_MAP_CENTER, MAPBOX_STYLE_URL, MAPBOX_TOKEN } from '@/lib/vybemap/mapbox/config';
import { snapMapPinArea, type MapPinArea } from '@/lib/vybemap/mapPinService';
import 'mapbox-gl/dist/mapbox-gl.css';

type Point = Pick<MapPinArea, 'latitude' | 'longitude'>;
export function MapPinAreaPicker({ value, onChoose, disabled = false }: { value: MapPinArea | null; onChoose: (point: Point) => void; disabled?: boolean }) {
  const container = useRef<HTMLDivElement>(null), mapRef = useRef<import('mapbox-gl').Map | null>(null);
  const latest = useRef({ value, onChoose, disabled }); latest.current = { value, onChoose, disabled };
  const chooseRef = useRef<((latitude: number, longitude: number) => void) | null>(null);
  const markerRef = useRef<((point: Point | null) => void) | null>(null);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    let alive = true, loaded = false, failed = false, map: import('mapbox-gl').Map | undefined, marker: import('mapbox-gl').Marker | undefined;
    setError(''); setReady(false);
    const fail = (message: string) => { if (alive) { failed = true; setReady(false); setError(message); } };
    const timer = setTimeout(() => fail('The area map took too long to load. Retry to choose an area.'), 15_000);
    void import('mapbox-gl').then(({ default: mapbox }) => {
      if (!alive || failed || !container.current) return;
      const initial = latest.current.value;
      map = new mapbox.Map({ container: container.current, accessToken: MAPBOX_TOKEN, style: MAPBOX_STYLE_URL['3d'], center: initial ? [initial.longitude, initial.latitude] : DEFAULT_MAP_CENTER, zoom: initial ? 10 : 1.5, pitch: 52, projection: 'globe' });
      mapRef.current = map;
      map.addControl(new mapbox.NavigationControl(), 'top-right');
      const paint = (point: Point | null) => {
        if (!alive || !loaded || failed) return;
        if (!point) { marker?.remove(); marker = undefined; return; }
        if (marker) marker.setLngLat([point.longitude, point.latitude]);
        else marker = new mapbox.Marker({ color: '#8b5cf6' }).setLngLat([point.longitude, point.latitude]).addTo(map!);
      };
      markerRef.current = paint;
      const choose = (latitude: number, longitude: number) => {
        if (!alive || !loaded || failed || latest.current.disabled || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
        // Mapbox wraps the world; select the matching geographic cell, not the antimeridian.
        const wrapped = ((longitude + 180) % 360 + 360) % 360 - 180;
        const point = snapMapPinArea(latitude, wrapped);
        paint(point); latest.current.onChoose(point);
      };
      chooseRef.current = choose;
      map.on('click', event => choose(event.lngLat.lat, event.lngLat.lng));
      map.once('load', () => { if (!alive || failed) return; clearTimeout(timer); loaded = true; paint(latest.current.value); setReady(true); });
      map.on('error', () => { if (!loaded) fail('The area map could not load. Retry to choose an area.'); });
    }).catch(() => fail('The area map could not load. Retry to choose an area.'));
    return () => { alive = false; clearTimeout(timer); marker?.remove(); map?.remove(); chooseRef.current = null; markerRef.current = null; if (mapRef.current === map) mapRef.current = null; };
  }, [retry]);
  useEffect(() => { markerRef.current?.(value); }, [value]);
  return <div className="space-y-2">
    <p className="text-sm text-muted-foreground">Move and zoom the globe, then tap an area. Keyboard users can move the map and choose its center. This never requests device location.</p>
    <div ref={container} className="h-64 overflow-hidden rounded-xl border" aria-label="Choose approximate map area" />
    {error ? <div role="alert" className="text-sm">{error} <Button variant="outline" onClick={() => setRetry(value => value + 1)}>Retry map</Button></div> : !ready && <p role="status">Loading area map…</p>}
    <Button type="button" variant="outline" disabled={disabled || !ready || !!error} onClick={() => { const map = mapRef.current; if (!map) return; const point = map.getCenter(); chooseRef.current?.(point.lat, point.lng); }}>Choose map center</Button>
  </div>;
}
