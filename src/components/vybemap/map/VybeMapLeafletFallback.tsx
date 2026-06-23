/**
 * Leaflet fallback when VITE_MAPBOX_ACCESS_TOKEN is not configured.
 */
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotate';
import type { LiveFriend, MapStoryPin, MapPostPin, MapClipPin, MapMeetup, MapPlace, MapEventPin, HeatmapCell, MapLayer } from '@/lib/vybemap/types';
import { activityMeta } from '@/lib/vybemap/activity';

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

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
  onFriendTap: (f: LiveFriend) => void;
  onPlaceTap: (p: MapPlace) => void;
  mapElRef: React.RefObject<HTMLDivElement | null>;
  onMapReady?: (map: L.Map) => void;
}

export function VybeMapLeafletFallback({
  center, layers, friends, stories, posts, clips, meetups, places, eventPins, heatmap,
  onFriendTap, onPlaceTap, mapElRef, onMapReady,
}: VybeMapLeafletProps) {
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = mapElRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: false, attributionControl: false, rotate: true, bearing: 0 } as L.MapOptions)
      .setView(center || DEFAULT_CENTER, center ? 14 : 4);
    L.tileLayer(DARK_TILES, { maxZoom: 19 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    heatLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    onMapReady?.(map);
    requestAnimationFrame(() => map.invalidateSize());
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const layer = markersRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (layers.friends) {
      friends.forEach((f) => {
        const lat = f.displayLat ?? f.latitude;
        const lng = f.displayLng ?? f.longitude;
        const act = activityMeta(f.activity_type || 'stationary');
        const html = `<div class="vybe-live-marker" style="--ring:${(f.speed || 0) > 0.5 ? '#22c55e' : '#6366f1'}">
          <img src="${f.profile?.avatar_url || ''}" onerror="this.style.display='none'" class="vybe-live-avatar"/>
          <span class="vybe-live-emoji">${act.icon}</span>
        </div>`;
        const icon = L.divIcon({ html, className: '', iconSize: [48, 48], iconAnchor: [24, 24] });
        L.marker([lat, lng], { icon }).addTo(layer).on('click', () => onFriendTap(f));
      });
    }
    if (layers.stories) stories.forEach((s) => {
      L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#ec4899', fillColor: '#f472b6', fillOpacity: 0.9, weight: 2 }).addTo(layer);
    });
    if (layers.trending || layers.hotspots) {
      places.slice(0, 40).forEach((p) => {
        const size = 36 + Math.min(p.check_in_count, 24);
        const emoji = p.category === 'food' ? '🍕' : '🔥';
        const html = `<div class="vybe-spot-marker" style="width:${size}px;height:${size}px">${p.photo_url ? `<img src="${p.photo_url}" class="vybe-spot-photo"/>` : emoji}</div>`;
        const icon = L.divIcon({ html, className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
        L.marker([p.latitude, p.longitude], { icon }).addTo(layer).on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          onPlaceTap(p);
        });
      });
    }
  }, [friends, stories, places, layers, onFriendTap, onPlaceTap]);

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
  }, [heatmap, layers.heatmap]);

  return null;
}

export function leafletFlyTo(map: L.Map | null, lat: number, lng: number, zoom = 15) {
  map?.flyTo([lat, lng], zoom, { duration: 1.2 });
}
