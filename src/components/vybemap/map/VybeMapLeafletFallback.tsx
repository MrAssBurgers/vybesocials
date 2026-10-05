/**
 * Optional flat renderer, entered only after an explicit user choice.
 */
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { LiveFriend, MapStoryPin, MapPostPin, MapClipPin, MapMeetup, MapPlace, MapEventPin, HeatmapCell, MapLayer } from '@/lib/vybemap/types';
import { activityMeta } from '@/lib/vybemap/activity';
import { createMapContentMarker } from './mapContentMarker';

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
export const FALLBACK_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface VybeMapLeafletProps {
  center: [number, number] | null;
  layers: Record<MapLayer, boolean>;
  friends: LiveFriend[];
  stories: MapStoryPin[];
  posts: MapPostPin[];
  clips: MapClipPin[];
  meetups: MapMeetup[];
  places: MapPlace[];
  eventPins: MapEventPin[];
  heatmap: HeatmapCell[];
  squadMemberIds?: Set<string>;
  onFriendTap: (f: LiveFriend) => void;
  onPlaceTap: (p: MapPlace) => void;
  onContentTap?: (pin: MapPostPin | MapClipPin) => void;
  mapElRef: React.RefObject<HTMLDivElement | null>;
  onMapReady?: (map: L.Map | null) => void;
}

export function VybeMapLeafletFallback({
  center, layers, friends, stories, posts, clips, meetups, places, eventPins, heatmap,
  onFriendTap, onPlaceTap, onContentTap, mapElRef, onMapReady, squadMemberIds,
}: VybeMapLeafletProps) {
  const mapRef = useRef<L.Map | null>(null);
  const readyCallback = useRef(onMapReady);
  readyCallback.current = onMapReady;
  const markersRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const el = mapElRef.current;
    if (!el || mapRef.current) return;
    let cancelled = false, hasTile = false;
    setStatus('loading');
    // The 2D fallback deliberately has no rotation plugin/global L dependency.
    const map = L.map(el, { zoomControl: false, attributionControl: false })
      .setView(center || DEFAULT_CENTER, center ? 14 : 4);
    const timer = setTimeout(() => { if (!cancelled && !hasTile) setStatus('error'); }, 15000);
    // Attribution is above DiscoveryDrawer, outside its collapsed content.
    // Keep normal browser caching/referrers; no prefetch or offline tile pack.
    const tiles = L.tileLayer(FALLBACK_TILES, {
      maxZoom: 19, keepBuffer: 0, updateWhenIdle: true, updateWhenZooming: false,
      detectRetina: false, referrerPolicy: 'strict-origin-when-cross-origin',
    });
    tiles.on('tileload', () => { if (!cancelled) { hasTile = true; clearTimeout(timer); setStatus('ready'); } });
    tiles.on('load', () => { if (!cancelled && !hasTile) { clearTimeout(timer); setStatus('error'); } });
    tiles.addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    heatLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    readyCallback.current?.(map);
    requestAnimationFrame(() => { if (!cancelled) map.invalidateSize(); });
    const ro = new ResizeObserver(() => {
      requestAnimationFrame(() => { if (!cancelled) { try { map.invalidateSize(); } catch { /* disposed */ } } });
    });
    ro.observe(el);
    return () => { cancelled = true; clearTimeout(timer); ro.disconnect(); tiles.off(); readyCallback.current?.(null); map.remove(); mapRef.current = null; markersRef.current = null; heatLayerRef.current = null; };
  }, [attempt]);

  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (layers.friends) {
      friends.forEach((f) => {
        const lat = f.displayLat ?? f.latitude;
        const lng = f.displayLng ?? f.longitude;
        const act = activityMeta(f.activity_type || 'stationary');
        const element = document.createElement('div'); element.className = 'vybe-mbx-friend';
        element.style.setProperty('--ring', squadMemberIds?.has(f.user_id) ? '#a855f7' : (f.speed || 0) > 0.5 ? '#22c55e' : '#6366f1');
        const fallback = document.createElement('span'); fallback.className = 'vybe-mbx-avatar flex items-center justify-center bg-zinc-200 text-zinc-600 font-bold text-lg';
        fallback.textContent = (f.profile?.display_name || f.profile?.username || '?').slice(0, 1); element.append(fallback);
        if (f.profile?.avatar_url) { const image = document.createElement('img'); image.src = f.profile.avatar_url; image.className = 'vybe-mbx-avatar absolute inset-0'; image.referrerPolicy = 'no-referrer'; image.onerror = () => { image.hidden = true; }; element.append(image); }
        const emoji = document.createElement('span'); emoji.className = 'vybe-mbx-act'; emoji.textContent = act.icon; element.append(emoji);
        const icon = L.divIcon({ html: element, className: '', iconSize: [56, 56], iconAnchor: [28, 28] });
        L.marker([lat, lng], { icon }).addTo(layer).on('click', () => onFriendTap(f));
      });
    }
    if (layers.stories) stories.forEach((s) => {
      L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#ec4899', fillColor: '#f472b6', fillOpacity: 0.9, weight: 2 }).addTo(layer);
    });
    const contentControls: ReturnType<typeof createMapContentMarker>[] = [];
    if (onContentTap) for (const pin of [...(layers.posts ? posts : []), ...(layers.clips ? clips : [])]) {
      const control = createMapContentMarker(pin, onContentTap); contentControls.push(control);
      const icon = L.divIcon({ html: control.element, className: '', iconSize: [46, 46], iconAnchor: [23, 23] });
      // The inner native button owns click/keyboard activation, avoiding double sends.
      L.marker([pin.latitude, pin.longitude], { icon, keyboard: false }).addTo(layer);
    }
    if (layers.trending || layers.hotspots) {
      places.slice(0, 40).forEach((p) => {
        const size = 36 + Math.min(p.check_in_count, 24);
        const emoji = p.category === 'food' ? '🍕' : '🔥';
        const element = document.createElement('div'); element.className = 'vybe-mbx-spot'; element.style.width = size + 'px'; element.style.height = size + 'px';
        if (p.photo_url) { const image = document.createElement('img'); image.src = p.photo_url; image.className = 'vybe-mbx-spot-img'; image.referrerPolicy = 'no-referrer'; element.append(image); } else element.textContent = emoji;
        const icon = L.divIcon({ html: element, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        L.marker([p.latitude, p.longitude], { icon }).addTo(layer).on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onPlaceTap(p);
        });
      });
    }
    return () => { contentControls.forEach(control => control.dispose()); };
  }, [friends, stories, posts, clips, places, layers, onFriendTap, onPlaceTap, onContentTap, attempt, squadMemberIds]);

  useEffect(() => {
    const hLayer = heatLayerRef.current;
    if (!hLayer) return;
    hLayer.clearLayers();
    if (!layers.heatmap) return;
    heatmap.forEach((cell) => {
      L.circle([cell.cell_latitude, cell.cell_longitude], {
        radius: 200 + cell.intensity * 400,
        color: 'transparent',
        fillColor: '#a855f7',
        fillOpacity: Math.min(0.45, cell.intensity / 100),
        weight: 0,
      }).addTo(hLayer);
    });
  }, [heatmap, layers.heatmap, attempt]);

  if (status === 'ready') return null;
  return <div className="absolute inset-0 z-[1100] flex items-center justify-center pointer-events-none p-6">
    <div className="rounded-2xl bg-background/95 border border-border p-5 text-center shadow-lg pointer-events-auto max-w-xs" role={status === 'error' ? 'alert' : 'status'}>
      <p className="text-sm">{status === 'error' ? 'Map tiles could not load. Check your connection and retry.' : 'Loading map…'}</p>
      {status === 'error' && <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Retry map</button>}
    </div>
  </div>;
}

export function leafletFlyTo(map: L.Map | null, lat: number, lng: number, zoom = 15) {
  // Instant setView — flyTo(1.2s) froze Fold / Android mid-range GPUs.
  map?.setView([lat, lng], zoom, { animate: false });
}

export function leafletWander(map: L.Map | null, lat?: number, lng?: number) {
  if (!map) return;
  const c = lat != null && lng != null ? ([lat, lng] as [number, number]) : map.getCenter();
  const zoom = Math.min(map.getZoom(), 12.5);
  map.setView(c, zoom, { animate: false });
}
