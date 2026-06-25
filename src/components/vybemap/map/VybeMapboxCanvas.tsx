import { useEffect, useRef, useCallback, useState, memo } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  MAPBOX_TOKEN,
  MAPBOX_STYLE_URL,
  DEFAULT_MAP_CENTER,
  pitchForMode,
  type MapViewMode,
} from '@/lib/vybemap/mapbox/config';
import { normalizeMediaUrl } from '@/lib/mediaUrl';
import { heatmapColor, heatmapOpacity } from '@/lib/vybemap/heatmapColors';
import { clusterPoints, type MarkerCluster } from '@/lib/vybemap/clusterMarkers';
import { isHeadingTowardYou } from '@/lib/vybemap/headingToward';
import type {
  LiveFriend,
  MapStoryPin,
  MapPostPin,
  MapClipPin,
  MapMeetup,
  MapPlace,
  MapEventPin,
  HeatmapCell,
  MapLayer,
} from '@/lib/vybemap/types';

mapboxgl.accessToken = MAPBOX_TOKEN || '';

export interface VybeMapboxCanvasProps {
  center: [number, number] | null;
  mapMode: MapViewMode;
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
  onMeetupTap?: (m: MapMeetup) => void;
  onMapReady?: (map: mapboxgl.Map) => void;
  routeGeometry?: GeoJSON.LineString | null;
  squadMemberIds?: Set<string>;
}

function clusterMarkerHtml(count: number): string {
  return `<div class="vybe-mbx-cluster">${count}</div>`;
}

function isCluster<T extends { id: string }>(
  item: (T & { friend?: LiveFriend }) | MarkerCluster<any>,
): item is MarkerCluster<any> {
  return 'count' in item && 'points' in item;
}


function friendMarkerHtml(f: LiveFriend, opts?: { headingToward?: boolean; squad?: boolean }): string {
  const ring = opts?.squad ? '#a855f7' : (f.speed || 0) > 0.5 ? '#22c55e' : '#facc15';
  const pulse = opts?.headingToward ? ' vybe-mbx-heading' : '';
  const initial = (f.profile?.display_name || f.profile?.username || '?')[0];
  const avatar = f.profile?.avatar_url
    ? `<img src="${normalizeMediaUrl(f.profile.avatar_url) || f.profile.avatar_url}" onerror="this.style.display='none'" class="vybe-mbx-avatar"/>`
    : `<div class="vybe-mbx-avatar flex items-center justify-center bg-zinc-200 text-zinc-600 font-bold text-lg">${initial}</div>`;
  return `<div class="vybe-mbx-friend${pulse}" style="--ring:${ring}">${avatar}</div>`;
}

function spotMarkerHtml(p: MapPlace): string {
  const size = 40 + Math.min(p.check_in_count, 20);
  const emoji = p.category === 'food' ? '🍕' : p.category === 'view' ? '🌅' : p.category === 'party' ? '🎉' : '🔥';
  const pulse = (p.check_in_count ?? 0) >= 8 ? ' vybe-mbx-spot-pulse' : '';
  const intel = p.intel_summary;
  const warn =
    intel?.verdict === 'avoid'
      ? '<span class="vybe-mbx-spot-warn vybe-mbx-spot-warn-danger">🚫</span>'
      : intel?.verdict === 'caution'
        ? '<span class="vybe-mbx-spot-warn">⚠️</span>'
        : '';
  return `<div class="vybe-mbx-spot-wrap">${warn}<div class="vybe-mbx-spot${pulse}" style="width:${size}px;height:${size}px">
    ${p.photo_url ? `<img src="${p.photo_url}" class="vybe-mbx-spot-img"/>` : `<span>${emoji}</span>`}
  </div></div>`;
}

function meetupMarkerHtml(title: string): string {
  const short = title.length > 12 ? `${title.slice(0, 11)}…` : title;
  return `<div class="vybe-mbx-meetup" title="${title.replace(/"/g, '&quot;')}">
    <span class="vybe-mbx-meetup-icon">📍</span>
    <span class="vybe-mbx-meetup-label">${short}</span>
  </div>`;
}

export const VybeMapboxCanvas = memo(function VybeMapboxCanvas({
  center,
  mapMode,
  layers,
  friends,
  stories,
  posts,
  clips,
  meetups,
  places,
  eventPins,
  heatmap,
  onFriendTap,
  onPlaceTap,
  onMeetupTap,
  onMapReady,
  routeGeometry,
  squadMemberIds,
}: VybeMapboxCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const friendMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const spotMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const meetupMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const selfMarker = useRef<mapboxgl.Marker | null>(null);
  const styleLoaded = useRef(false);
  const [mapZoom, setMapZoom] = useState(14);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const myCoordsRef = useRef(center);
  myCoordsRef.current = center;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current || !MAPBOX_TOKEN) return;

    const initial = center ? [center[1], center[0]] as [number, number] : DEFAULT_MAP_CENTER;
    let cancelled = false;

    const map = new mapboxgl.Map({
      container: el,
      style: MAPBOX_STYLE_URL[mapMode],
      center: initial,
      zoom: center ? 14 : 3.5,
      pitch: pitchForMode(mapMode),
      bearing: 0,
      antialias: false,
      attributionControl: false,
      failIfMajorPerformanceCaveat: false,
    });

    mapRef.current = map;

    const finishLoad = () => {
      if (cancelled) return;
      styleLoaded.current = true;
      setMapZoom(map.getZoom());
      setMapReady(true);
      setMapError(null);
      requestAnimationFrame(() => {
        try { map.resize(); } catch { /* ignore */ }
      });
    };

    const addOverlays = () => {
      try {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', {
            type: 'raster-dem',
            url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
            tileSize: 512,
            maxzoom: 14,
          });
        }
      } catch { /* dem may exist */ }

      if (mapMode === 'terrain' || mapMode === '3d') {
        try {
          map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 });
        } catch { /* optional */ }
      }

      if (!map.getSource('vybe-heatmap')) {
        map.addSource('vybe-heatmap', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        map.addLayer({
          id: 'vybe-heatmap-glow',
          type: 'circle',
          source: 'vybe-heatmap',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0, 30, 100, 120],
            'circle-color': ['get', 'color'],
            'circle-opacity': ['get', 'opacity'],
            'circle-blur': 0.6,
          },
        });
      }

      onMapReady?.(map);
    };

    map.on('load', () => {
      finishLoad();
      addOverlays();
    });

    map.on('error', (e) => {
      if (cancelled) return;
      const msg = e?.error?.message || 'Map failed to load';
      console.warn('[VybeMapboxCanvas]', msg);
      if (!styleLoaded.current && mapMode !== '2d') {
        map.setStyle(MAPBOX_STYLE_URL['2d']);
        map.once('style.load', () => {
          finishLoad();
          addOverlays();
        });
        return;
      }
      setMapError(msg);
    });

    map.on('zoomend', () => setMapZoom(map.getZoom()));

    const ro = new ResizeObserver(() => {
      try { map.resize(); } catch { /* ignore */ }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      friendMarkers.current.forEach((m) => m.remove());
      friendMarkers.current.clear();
      spotMarkers.current.forEach((m) => m.remove());
      spotMarkers.current.clear();
      meetupMarkers.current.forEach((m) => m.remove());
      meetupMarkers.current.clear();
      selfMarker.current?.remove();
      selfMarker.current = null;
      map.remove();
      mapRef.current = null;
      styleLoaded.current = false;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyStyle = () => {
      map.setStyle(MAPBOX_STYLE_URL[mapMode]);
      map.once('style.load', () => {
        map.setPitch(pitchForMode(mapMode));
        if (mapMode === 'terrain' || mapMode === '3d') {
          try {
            if (!map.getSource('mapbox-dem')) {
              map.addSource('mapbox-dem', {
                type: 'raster-dem',
                url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
                tileSize: 512,
                maxzoom: 14,
              });
            }
            map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 });
          } catch { /* optional */ }
        } else {
          try { map.setTerrain(null); } catch { /* ignore */ }
        }
      });
    };
    if (styleLoaded.current) applyStyle();
  }, [mapMode]);

  useEffect(() => {
    if (!center || !mapRef.current) return;
    mapRef.current.easeTo({
      center: [center[1], center[0]],
      duration: 800,
      essential: true,
    });
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current || !center) {
      selfMarker.current?.remove();
      selfMarker.current = null;
      return;
    }
    const lngLat: [number, number] = [center[1], center[0]];
    if (!selfMarker.current) {
      const el = document.createElement('div');
      el.className = 'vybe-mbx-self';
      el.setAttribute('aria-hidden', 'true');
      selfMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      selfMarker.current.setLngLat(lngLat);
    }
  }, [center?.[0], center?.[1]]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;

    const existing = friendMarkers.current;
    const seen = new Set<string>();

    if (layers.friends) {
      const friendPoints = friends.map((f) => ({
        id: f.user_id,
        latitude: f.displayLat ?? f.latitude,
        longitude: f.displayLng ?? f.longitude,
        friend: f,
      }));
      const clustered = clusterPoints(friendPoints, mapZoom);

      clustered.forEach((item) => {
        const id = isCluster(item) ? item.id : item.id;
        seen.add(id);
        const lat = isCluster(item) ? item.latitude : item.latitude;
        const lng = isCluster(item) ? item.longitude : item.longitude;
        const lngLat: [number, number] = [lng, lat];
        let marker = existing.get(id);
        const html = isCluster(item)
          ? clusterMarkerHtml(item.count)
          : friendMarkerHtml(item.friend, {
              headingToward: myCoordsRef.current
                ? isHeadingTowardYou(item.friend, myCoordsRef.current)
                : false,
              squad: squadMemberIds?.has(item.friend.user_id),
            });
        if (!marker) {
          const el = document.createElement('div');
          el.innerHTML = html;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isCluster(item) && item.points[0]) {
              onFriendTap(item.points[0].friend);
            } else if (!isCluster(item)) {
              onFriendTap(item.friend);
            }
          });
          marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(map);
          existing.set(id, marker);
        } else {
          marker.setLngLat(lngLat);
          const el = marker.getElement();
          if (el) el.innerHTML = html;
        }
      });
    }

    existing.forEach((m, id) => {
      if (!seen.has(id) || !layers.friends) {
        m.remove();
        existing.delete(id);
      }
    });
  }, [friends, layers.friends, mapZoom, squadMemberIds, onFriendTap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    const sid = 'vybe-route';
    const lid = 'vybe-route-line';
    if (!routeGeometry) {
      if (map.getLayer(lid)) map.removeLayer(lid);
      if (map.getSource(sid)) map.removeSource(sid);
      return;
    }
    const data: GeoJSON.Feature = { type: 'Feature', geometry: routeGeometry, properties: {} };
    if (map.getSource(sid)) {
      (map.getSource(sid) as mapboxgl.GeoJSONSource).setData(data);
    } else {
      try {
        map.addSource(sid, { type: 'geojson', data });
        if (!map.getLayer(lid)) {
          map.addLayer({
            id: lid,
            type: 'line',
            source: sid,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-color': '#8b5cf6',
              'line-width': 5,
              'line-opacity': 0.85,
            },
          });
        }
      } catch (err) {
        console.warn('[VybeMapboxCanvas] route layer', err);
      }
    }
    try {
      const coords = routeGeometry.coordinates;
      if (coords.length >= 2) {
        const bounds = coords.reduce(
          (b, c) => b.extend(c as [number, number]),
          new mapboxgl.LngLatBounds(coords[0] as [number, number], coords[0] as [number, number]),
        );
        map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 900 });
      }
    } catch {
      /* ignore bounds fit errors */
    }
  }, [routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;

    const existing = spotMarkers.current;
    const seen = new Set<string>();
    const show = layers.trending || layers.hotspots;

    if (show) {
      places.slice(0, 50).forEach((p) => {
        seen.add(p.id);
        const lngLat: [number, number] = [p.longitude, p.latitude];
        let marker = existing.get(p.id);
        if (!marker) {
          const el = document.createElement('div');
          el.innerHTML = spotMarkerHtml(p);
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onPlaceTap(p);
          });
          marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(map);
          existing.set(p.id, marker);
        } else {
          marker.setLngLat(lngLat);
          const el = marker.getElement();
          if (el) el.innerHTML = spotMarkerHtml(p);
        }
      });
    }

    existing.forEach((m, id) => {
      if (!seen.has(id) || !show) {
        m.remove();
        existing.delete(id);
      }
    });
  }, [places, layers.trending, layers.hotspots, onPlaceTap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;

    const existing = meetupMarkers.current;
    const seen = new Set<string>();

    if (layers.meetups && onMeetupTap) {
      meetups.forEach((m) => {
        seen.add(m.id);
        const lngLat: [number, number] = [m.dest_longitude, m.dest_latitude];
        let marker = existing.get(m.id);
        const html = meetupMarkerHtml(m.title);
        if (!marker) {
          const el = document.createElement('div');
          el.innerHTML = html;
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            onMeetupTap(m);
          });
          marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
            .setLngLat(lngLat)
            .addTo(map);
          existing.set(m.id, marker);
        } else {
          marker.setLngLat(lngLat);
          const el = marker.getElement();
          if (el) el.innerHTML = html;
        }
      });
    }

    existing.forEach((m, id) => {
      if (!seen.has(id) || !layers.meetups) {
        m.remove();
        existing.delete(id);
      }
    });
  }, [meetups, layers.meetups, onMeetupTap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource('vybe-heatmap')) return;
    const src = map.getSource('vybe-heatmap') as mapboxgl.GeoJSONSource;
    if (!layers.heatmap) {
      src.setData({ type: 'FeatureCollection', features: [] });
      return;
    }
    src.setData({
      type: 'FeatureCollection',
      features: heatmap.map((cell) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [cell.cell_longitude, cell.cell_latitude],
        },
        properties: {
          intensity: cell.intensity,
          color: heatmapColor(cell.intensity),
          opacity: heatmapOpacity(cell.intensity),
        },
      })),
    });
  }, [heatmap, layers.heatmap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;

    const pinLayer = (id: string, coords: [number, number][], color: string, show: boolean) => {
      const sid = `vybe-${id}`;
      if (!show) {
        if (map.getLayer(sid)) map.removeLayer(sid);
        if (map.getSource(sid)) map.removeSource(sid);
        return;
      }
      const features = coords.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: c },
        properties: {},
      }));
      if (map.getSource(sid)) {
        (map.getSource(sid) as mapboxgl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features,
        });
      } else {
        map.addSource(sid, { type: 'geojson', data: { type: 'FeatureCollection', features } });
        map.addLayer({
          id: sid,
          type: 'circle',
          source: sid,
          paint: {
            'circle-radius': 8,
            'circle-color': color,
            'circle-stroke-width': 2,
            'circle-stroke-color': '#fff',
          },
        });
      }
    };

    pinLayer(
      'stories',
      stories.map((s) => [s.longitude, s.latitude]),
      '#ec4899',
      layers.stories,
    );
    pinLayer(
      'posts',
      posts.map((p) => [p.longitude, p.latitude]),
      '#8b5cf6',
      layers.posts,
    );
    pinLayer(
      'clips',
      clips.map((c) => [c.longitude, c.latitude]),
      '#06b6d4',
      layers.clips,
    );
    pinLayer(
      'events',
      eventPins.map((e) => [e.longitude, e.latitude]),
      '#f59e0b',
      layers.events,
    );
  }, [stories, posts, clips, eventPins, layers]);

  useEffect(() => {
    const map = mapRef.current as (mapboxgl.Map & { setBearing?: (b: number) => void }) | null;
    if (!map) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const h = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
        ?? (e.alpha != null ? 360 - e.alpha : null);
      if (h != null) map.setBearing(h);
    };
    window.addEventListener('deviceorientation', onOrient, true);
    return () => window.removeEventListener('deviceorientation', onOrient, true);
  }, []);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 vybe-map-canvas touch-none" />
      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center vybe-map-loading">
          <div className="vybe-map-loading-pulse" aria-hidden />
        </div>
      )}
      {mapError && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-8">
          <p className="text-center text-sm text-white/50 max-w-xs">{mapError}</p>
        </div>
      )}
    </>
  );
});

export function useVybeMapFlyTo() {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const setMap = useCallback((map: mapboxgl.Map) => { mapRef.current = map; }, []);
  const flyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200, essential: true });
  }, []);
  const resetBearing = useCallback(() => {
    mapRef.current?.easeTo({ bearing: 0, pitch: pitchForMode('2d'), duration: 600 });
  }, []);
  return { setMap, flyTo, resetBearing };
}
