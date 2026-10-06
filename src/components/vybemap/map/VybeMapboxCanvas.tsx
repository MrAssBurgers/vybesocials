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
import {
  lerpHeading,
  subscribeForegroundDeviceHeading,
} from '@/lib/vybemap/deviceHeading';
import { getRuntimeOs } from '@/lib/despiaBridge';
import { createMapContentMarker } from './mapContentMarker';
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

const isAndroidMap = () => getRuntimeOs() === 'android';

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
  onContentTap?: (pin: MapPostPin | MapClipPin) => void;
  onMapReady?: (map: mapboxgl.Map | null) => void;
  onUseFlatFallback?: () => void;
  routeGeometry?: GeoJSON.LineString | null;
  squadMemberIds?: Set<string>;
  /** Device/GPS heading in degrees (0 = north). */
  userHeading?: number | null;
  /** When true, map bearing tracks device compass. Pauses while user pans/zooms. */
  followHeading?: boolean;
}

function clusterMarkerHtml(count: number): string {
  return `<div class="vybe-mbx-cluster">${count}</div>`;
}

function isCluster<T extends { id: string }>(
  item: (T & { friend?: LiveFriend }) | MarkerCluster<any>,
): item is MarkerCluster<any> {
  return 'count' in item && 'points' in item;
}


function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"'`=/]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;', '/': '&#47;' }[c] as string
  ));
}

function safeImgUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/') && !trimmed.startsWith('data:image/')) return null;
  // Reject quotes/whitespace/control chars that could break out of the attribute.
  if (/["'<>\s]/.test(trimmed)) return null;
  return trimmed;
}

function friendMarkerHtml(f: LiveFriend, opts?: { headingToward?: boolean; squad?: boolean }): string {
  const ring = opts?.squad ? '#a855f7' : (f.speed || 0) > 0.5 ? '#22c55e' : '#facc15';
  const pulse = opts?.headingToward ? ' vybe-mbx-heading' : '';
  const initial = escapeHtml((f.profile?.display_name || f.profile?.username || '?')[0] || '?');
  const avatarUrl = safeImgUrl(normalizeMediaUrl(f.profile?.avatar_url || '') || f.profile?.avatar_url || null);
  const avatar = avatarUrl
    ? `<img src="${avatarUrl}" onerror="this.style.display='none'" class="vybe-mbx-avatar"/>`
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
  const photoUrl = safeImgUrl(p.photo_url);
  return `<div class="vybe-mbx-spot-wrap">${warn}<div class="vybe-mbx-spot${pulse}" style="width:${size}px;height:${size}px">
    ${photoUrl ? `<img src="${photoUrl}" class="vybe-mbx-spot-img"/>` : `<span>${emoji}</span>`}
  </div></div>`;
}

function meetupMarkerHtml(title: string): string {
  const short = title.length > 12 ? `${title.slice(0, 11)}…` : title;
  return `<div class="vybe-mbx-meetup" title="${escapeHtml(title)}">
    <span class="vybe-mbx-meetup-icon">📍</span>
    <span class="vybe-mbx-meetup-label">${escapeHtml(short)}</span>
  </div>`;
}

function applySelfMarkerStyles(
  el: HTMLElement,
  headingDeg: number | null,
  mapBearing: number,
  opts?: { followHeading?: boolean },
) {
  const hasHeading = headingDeg != null && Number.isFinite(headingDeg);
  // When the map rotates with the phone, keep the beam pointing "up" (screen-forward)
  // like Google Maps — avoid CSS ease fighting camera updates.
  const display = !hasHeading
    ? 0
    : opts?.followHeading
      ? 0
      : ((headingDeg! - mapBearing + 360) % 360);
  el.className = `vybe-mbx-self${hasHeading ? '' : ' vybe-mbx-self--no-heading'}${opts?.followHeading ? ' vybe-mbx-self--follow' : ''}`;
  el.style.setProperty('--self-heading', `${display}deg`);
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
  onContentTap,
  onMapReady,
  onUseFlatFallback,
  routeGeometry,
  squadMemberIds,
  userHeading = null,
  followHeading = false,
}: VybeMapboxCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const friendMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const spotMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const meetupMarkers = useRef(new Map<string, mapboxgl.Marker>());
  const contentMarkers = useRef(new Map<string, { marker: mapboxgl.Marker; control: ReturnType<typeof createMapContentMarker> }>());
  const selfMarker = useRef<mapboxgl.Marker | null>(null);
  const styleLoaded = useRef(false);
  const styleGeneration = useRef(0);
  const styleController = useRef<{ setMode: (mode: MapViewMode) => void } | null>(null);
  const readyCallback = useRef(onMapReady);
  readyCallback.current = onMapReady;
  const [readyGeneration, setReadyGeneration] = useState(0);
  const [mapZoom, setMapZoom] = useState(14);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapBearing, setMapBearing] = useState(0);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const myCoordsRef = useRef(center);
  myCoordsRef.current = center;
  const userHeadingRef = useRef(userHeading);
  userHeadingRef.current = userHeading;
  /** Pauses GPS camera follow after a real pan/zoom (not heading rotate). */
  const userInteractingRef = useRef(false);
  const interactPauseRef = useRef<ReturnType<typeof setTimeout>>();
  /** Brief pause of bearing follow after user pinch-rotates the map. */
  const headingInteractPauseRef = useRef(false);
  const headingInteractTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Camera follows your GPS dot until you pan/zoom away; only the recenter
  // button (vybe:resume-follow) re-engages it. No timed snap-back.
  const followSelfRef = useRef(true);
  const targetHeadingRef = useRef<number | null>(null);
  const smoothedBearingRef = useRef<number | null>(null);
  const headingRafRef = useRef<number | null>(null);
  const wakeHeadingRef = useRef(() => {});
  const applyingBearingRef = useRef(false);

  const isUserMapGesture = useCallback((e?: object) => {
    if (!e || typeof e !== 'object') return false;
    // Mapbox attaches the native event on real gestures; setBearing/easeTo do not.
    if (!('originalEvent' in e)) return false;
    return !!(e as { originalEvent?: unknown }).originalEvent;
  }, []);

  const pauseFollowWhileInteracting = useCallback((e?: object) => {
    if (!isUserMapGesture(e)) return;
    followSelfRef.current = false;
    userInteractingRef.current = true;
    if (interactPauseRef.current) clearTimeout(interactPauseRef.current);
    interactPauseRef.current = setTimeout(() => {
      userInteractingRef.current = false;
    }, 2500);
  }, [isUserMapGesture]);

  const pauseHeadingFollowGesture = useCallback((e?: object) => {
    if (applyingBearingRef.current) return;
    if (!isUserMapGesture(e)) return;
    headingInteractPauseRef.current = true;
    if (headingInteractTimerRef.current) clearTimeout(headingInteractTimerRef.current);
    headingInteractTimerRef.current = setTimeout(() => {
      headingInteractPauseRef.current = false;
      wakeHeadingRef.current();
    }, 1200);
  }, [isUserMapGesture]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    setMapError(null);
    setMapReady(false);
    readyCallback.current?.(null);
    if (!MAPBOX_TOKEN) { setMapError('The 3D map is not configured.'); return; }
    let cancelled = false;
    let activeMode = mapMode;
    let disposeStyle = () => {};
    const initial = center ? [center[1], center[0]] as [number, number] : DEFAULT_MAP_CENTER;
    let map: mapboxgl.Map;
    try { map = new mapboxgl.Map({
      container: el, style: MAPBOX_STYLE_URL[mapMode], center: initial,
      zoom: center ? 14 : 3.5, pitch: pitchForMode(mapMode),
      projection: { name: mapMode === '3d' ? 'globe' : 'mercator' },
      bearing: 0, antialias: false, attributionControl: false,
      failIfMajorPerformanceCaveat: false,
    }); } catch {
      setMapError('The 3D map could not start on this device.');
      return;
    }
    mapRef.current = map;
    const clearMarkers = () => {
      for (const markers of [friendMarkers, spotMarkers, meetupMarkers]) {
        markers.current.forEach(marker => marker.remove());
        markers.current.clear();
      }
      selfMarker.current?.remove(); selfMarker.current = null;
      contentMarkers.current.forEach(({ marker, control }) => { control.dispose(); marker.remove(); });
      contentMarkers.current.clear();
    };
    const beginStyle = (mode: MapViewMode, replace: boolean) => {
      disposeStyle();
      activeMode = mode;
      const generation = ++styleGeneration.current;
      const current = () => !cancelled && mapRef.current === map && styleGeneration.current === generation;
      let complete = false;
      styleLoaded.current = false;
      setMapReady(false);
      setMapError(null);
      readyCallback.current?.(null);
      clearMarkers();
      const timer = setTimeout(() => {
        if (current() && !complete) setMapError('The 3D map is taking too long to load.');
      }, 20_000);
      const finish = () => {
        if (!current() || complete) return;
        complete = true;
        clearTimeout(timer);
        map.setProjection({ name: mode === '3d' ? 'globe' : 'mercator' });
        map.setPitch(pitchForMode(mode));
        // setStyle discards custom sources. Rebuild the base overlays before
        // advancing readiness; all current data effects then hydrate this style.
        try {
          if (mode === 'terrain' || mode === '3d') {
            if (!map.getSource('mapbox-dem')) map.addSource('mapbox-dem', {
              type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14,
            });
            map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 });
          } else map.setTerrain(null);
        } catch { /* Terrain is optional; keep the working basemap. */ }
        if (!map.getSource('vybe-heatmap')) map.addSource('vybe-heatmap', {
          type: 'geojson', data: { type: 'FeatureCollection', features: [] },
        });
        if (!map.getLayer('vybe-heatmap-glow')) map.addLayer({
          id: 'vybe-heatmap-glow', type: 'circle', source: 'vybe-heatmap',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'intensity'], 0, 30, 100, 120],
            'circle-color': ['get', 'color'], 'circle-opacity': ['get', 'opacity'], 'circle-blur': 0.6,
          },
        });
        styleLoaded.current = true;
        setMapZoom(map.getZoom());
        setMapError(null);
        setMapReady(true);
        setReadyGeneration(generation);
        readyCallback.current?.(map);
        requestAnimationFrame(() => { if (current()) { try { map.resize(); } catch { /* disposed */ } } });
      };
      const fail = () => {
        if (!current() || complete) return;
        // A late optional terrain/tile warning must not cover a usable basemap.
        clearTimeout(timer);
        setMapError('The 3D map could not load. Check your connection and retry.');
      };
      map.on('style.load', finish);
      map.on('error', fail);
      disposeStyle = () => { clearTimeout(timer); map.off('style.load', finish); map.off('error', fail); };
      if (replace) { try { map.setStyle(MAPBOX_STYLE_URL[mode]); } catch { fail(); } }
    };
    const controller = { setMode: (mode: MapViewMode) => {
      if (!cancelled && mapRef.current === map && mode !== activeMode) beginStyle(mode, true);
    } };
    styleController.current = controller;
    beginStyle(mapMode, false);
    const updateZoom = () => { if (!cancelled && mapRef.current === map) setMapZoom(map.getZoom()); };
    map.on('zoomend', updateZoom);
    const ro = new ResizeObserver(() => {
      if (!cancelled && mapRef.current === map) { try { map.resize(); } catch { /* disposed */ } }
    });
    ro.observe(el);
    return () => {
      cancelled = true;
      disposeStyle();
      ro.disconnect();
      map.off('zoomend', updateZoom);
      clearMarkers();
      if (styleController.current === controller) styleController.current = null;
      if (mapRef.current === map) {
        readyCallback.current?.(null);
        mapRef.current = null;
        styleLoaded.current = false;
      }
      map.remove();
    };
  }, [attempt]);

  useEffect(() => { styleController.current?.setMode(mapMode); }, [mapMode]);

  useEffect(() => {
    if (!center || !mapRef.current || !styleLoaded.current) return;
    if (!followSelfRef.current || userInteractingRef.current) return;
    // [Android-only] jumpTo — easeTo(650ms) made Follow feel frozen on Fold/mid-range GPUs.
    if (isAndroidMap()) {
      mapRef.current.jumpTo({ center: [center[1], center[0]] });
      return;
    }
    mapRef.current.easeTo({
      center: [center[1], center[0]],
      duration: 280,
      essential: true,
    });
  }, [center?.[0], center?.[1], readyGeneration]);

  // Prefer compass (phone facing) over GPS course-over-ground — GPS heading is often
  // null/stale when standing still and points travel direction while walking.
  const resolvedHeading = deviceHeading ?? userHeading ?? null;

  const refreshSelfMarker = useCallback((
    lngLat: [number, number],
    bearing: number,
    heading: number | null,
    following: boolean,
  ) => {
    const map = mapRef.current;
    if (!map) return;
    if (!selfMarker.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.innerHTML =
        '<div class="vybe-mbx-self__pulse"></div><div class="vybe-mbx-self__beam"></div><div class="vybe-mbx-self__dot"></div>';
      applySelfMarkerStyles(el, heading, bearing, { followHeading: following });
      selfMarker.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat)
        .addTo(map);
    } else {
      selfMarker.current.setLngLat(lngLat);
      const el = selfMarker.current.getElement();
      if (el) applySelfMarkerStyles(el, heading, bearing, { followHeading: following });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current || !center) {
      selfMarker.current?.remove();
      selfMarker.current = null;
      return;
    }
    const lngLat: [number, number] = [center[1], center[0]];
    refreshSelfMarker(lngLat, mapBearing, resolvedHeading, followHeading);
  }, [center?.[0], center?.[1], mapBearing, resolvedHeading, followHeading, refreshSelfMarker, readyGeneration]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // While follow-heading is on, beam stays screen-up — skip bearing React state
    // (setBearing fires rotate every frame and would thrash renders).
    if (followHeading) {
      setMapBearing(map.getBearing());
      return;
    }
    let raf = 0;
    const onRotate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setMapBearing(map.getBearing());
      });
    };
    onRotate();
    map.on('rotate', onRotate);
    return () => {
      map.off('rotate', onRotate);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mapReady, followHeading, readyGeneration]);

  useEffect(() => {
    return subscribeForegroundDeviceHeading((sample) => {
      targetHeadingRef.current = sample.heading;
      setDeviceHeading(sample.heading);
      wakeHeadingRef.current();
    }, () => {
      targetHeadingRef.current = null;
      smoothedBearingRef.current = null;
      setDeviceHeading(null);
      if (headingRafRef.current != null) cancelAnimationFrame(headingRafRef.current);
      headingRafRef.current = null;
    });
  }, []);

  // Smooth compass follow runs only while moving toward a current heading.
  useEffect(() => {
    if (!followHeading || !mapReady) {
      wakeHeadingRef.current = () => {};
      if (headingRafRef.current != null) {
        cancelAnimationFrame(headingRafRef.current);
        headingRafRef.current = null;
      }
      return;
    }

    const map = mapRef.current;
    const android = isAndroidMap();
    let active = true;
    // Snap once so Follow engages instantly, then lerp for smoothness.
    const snapTarget = targetHeadingRef.current;
    if (map && snapTarget != null) {
      smoothedBearingRef.current = snapTarget;
      try {
        applyingBearingRef.current = true;
        map.setBearing(snapTarget);
      } catch { /* ignore */ } finally {
        applyingBearingRef.current = false;
      }
    }

    // [Android-only] Higher alpha = near-instant compass lock.
    const alpha = android ? 0.42 : 0.22;

    const wake = () => {
      if (!active || headingRafRef.current != null || targetHeadingRef.current == null || headingInteractPauseRef.current || document.visibilityState === 'hidden') return;
      headingRafRef.current = requestAnimationFrame(tick);
    };
    const tick = () => {
      headingRafRef.current = null;
      const liveMap = mapRef.current;
      const target = targetHeadingRef.current;
      if (!active || !liveMap || liveMap !== map || target == null || headingInteractPauseRef.current || document.visibilityState === 'hidden') return;

      const current =
        smoothedBearingRef.current ??
        ((liveMap.getBearing() % 360) + 360) % 360;
      const next = lerpHeading(current, target, alpha);
      smoothedBearingRef.current = next;
      const delta = Math.abs(((next - current + 540) % 360) - 180);
      if (delta < (android ? 0.08 : 0.05)) return;
      try {
        applyingBearingRef.current = true;
        liveMap.setBearing(next);
      } catch {
        /* ignore */
      } finally {
        applyingBearingRef.current = false;
      }
      wake();
    };

    wakeHeadingRef.current = wake;
    wake();
    return () => {
      active = false;
      if (wakeHeadingRef.current === wake) wakeHeadingRef.current = () => {};
      if (headingRafRef.current != null) {
        cancelAnimationFrame(headingRafRef.current);
        headingRafRef.current = null;
      }
    };
  }, [followHeading, mapReady, readyGeneration]);

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
  }, [friends, layers.friends, mapZoom, squadMemberIds, onFriendTap, readyGeneration]);

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
  }, [routeGeometry, readyGeneration]);

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
  }, [places, layers.trending, layers.hotspots, onPlaceTap, readyGeneration]);

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
  }, [meetups, layers.meetups, onMeetupTap, readyGeneration]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current || !map.getSource('vybe-heatmap')) return;
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
  }, [heatmap, layers.heatmap, readyGeneration]);

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
      'events',
      eventPins.map((e) => [e.longitude, e.latitude]),
      '#f59e0b',
      layers.events,
    );
  }, [stories, eventPins, layers, readyGeneration]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded.current) return;
    const seen = new Set<string>();
    if (onContentTap) {
      const pins = [...(layers.posts ? posts : []), ...(layers.clips ? clips : [])];
      for (const pin of pins) {
        seen.add(pin.id);
        let entry = contentMarkers.current.get(pin.id);
        if (!entry) {
          const control = createMapContentMarker(pin, onContentTap);
          const marker = new mapboxgl.Marker({ element: control.element, anchor: 'center' }).setLngLat([pin.longitude, pin.latitude]).addTo(map);
          entry = { marker, control }; contentMarkers.current.set(pin.id, entry);
        } else {
          entry.control.update(pin, onContentTap);
          entry.marker.setLngLat([pin.longitude, pin.latitude]);
        }
      }
    }
    contentMarkers.current.forEach(({ marker, control }, id) => {
      if (!seen.has(id)) { control.dispose(); marker.remove(); contentMarkers.current.delete(id); }
    });
  }, [posts, clips, layers.posts, layers.clips, onContentTap, readyGeneration]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const resumeFollow = () => {
      followSelfRef.current = true;
      userInteractingRef.current = false;
      if (interactPauseRef.current) clearTimeout(interactPauseRef.current);
      interactPauseRef.current = undefined;
      headingInteractPauseRef.current = false;
      if (headingInteractTimerRef.current) clearTimeout(headingInteractTimerRef.current);
      headingInteractTimerRef.current = undefined;
      smoothedBearingRef.current = null;
      wakeHeadingRef.current();
    };
    const pauseFollow = () => {
      followSelfRef.current = false;
    };
    // Position follow: drag / zoom / pitch only — NOT touchstart (that froze compass).
    map.on('dragstart', pauseFollowWhileInteracting);
    map.on('zoomstart', pauseFollowWhileInteracting);
    map.on('pitchstart', pauseFollowWhileInteracting);
    // Heading follow: only pause briefly on user two-finger rotate, not our setBearing.
    map.on('rotatestart', pauseHeadingFollowGesture);
    map.on('vybe:resume-follow' as 'load', resumeFollow);
    map.on('vybe:pause-follow' as 'load', pauseFollow);
    return () => {
      map.off('dragstart', pauseFollowWhileInteracting);
      map.off('zoomstart', pauseFollowWhileInteracting);
      map.off('pitchstart', pauseFollowWhileInteracting);
      map.off('rotatestart', pauseHeadingFollowGesture);
      map.off('vybe:resume-follow' as 'load', resumeFollow);
      map.off('vybe:pause-follow' as 'load', pauseFollow);
      if (interactPauseRef.current) clearTimeout(interactPauseRef.current);
      if (headingInteractTimerRef.current) clearTimeout(headingInteractTimerRef.current);
      interactPauseRef.current = undefined;
      headingInteractTimerRef.current = undefined;
      userInteractingRef.current = false;
      headingInteractPauseRef.current = false;
    };
  }, [mapReady, pauseFollowWhileInteracting, pauseHeadingFollowGesture, readyGeneration]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 vybe-map-canvas touch-none" />
      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center vybe-map-loading">
          <div className="vybe-map-loading-pulse" aria-hidden />
          <span role="status" className="sr-only">{mapMode === '3d' ? 'Loading 3D world map…' : 'Loading map…'}</span>
        </div>
      )}
      {mapError && (
        <div className="pointer-events-none absolute inset-0 z-[1100] flex items-center justify-center px-8">
          <div className="pointer-events-auto rounded-2xl border border-border bg-background/95 p-5 text-center shadow-lg max-w-xs" role="alert">
            <p className="text-sm">{mapMode === '3d' ? mapError : mapError.replace('3D map', 'map')}</p>
            <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{mapMode === '3d' ? 'Retry 3D map' : 'Retry map'}</button>
            {onUseFlatFallback && <button type="button" onClick={onUseFlatFallback} className="mt-3 block mx-auto text-xs text-muted-foreground underline">Use flat map instead</button>}
          </div>
        </div>
      )}
    </>
  );
});

// useVybeMapFlyTo moved to ./useVybeMapFlyTo so pages can control the camera
// without statically importing this module (and mapbox-gl with it).
