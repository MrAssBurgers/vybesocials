import { useState, useEffect, useCallback, useRef, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Navigation, MapPin, Search, Layers, Ghost, X, MessageCircle, ExternalLink, User, Car, Footprints, Pause, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useLocationContext } from '@/providers/LocationProvider';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/* ── Map Error Boundary ─────────────────────────────── */

class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[MapErrorBoundary]', error.message, info.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-background text-foreground gap-4 p-8">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-bold">Map couldn't load</h2>
          <p className="text-sm text-muted-foreground text-center max-w-xs">Something went wrong loading the map. Try refreshing.</p>
          <button onClick={() => { this.setState({ hasError: false, error: null }); }} className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ── types ───────────────────────────────────────────── */

interface LocationRecord {
  id: string;
  user_id: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  label: string | null;
  updated_at: string;
  expires_at: string | null;
  sharing_enabled: boolean;
  status?: string | null;
  speed?: number | null;
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PublicProfileSummary {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

/* ── constants ───────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;
const FRIEND_FOCUS_ZOOM = 16;
const MY_LOCATION_ZOOM = 16;
const UPSERT_INTERVAL_MS = 15_000;
const SHARING_PREF_KEY = 'vybe-map-sharing';
const MAP_STYLE_KEY = 'vybe-map-style';

const MAP_TILES: Record<string, { url: string; label: string; icon: string }> = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    label: 'Satellite',
    icon: '🛰️',
  },
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    label: 'Dark',
    icon: '🌑',
  },
  terrain: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    label: 'Terrain',
    icon: '🏔️',
  },
  streets: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    label: 'Streets',
    icon: '🗺️',
  },
};

type MapStyleKey = keyof typeof MAP_TILES;

function isMapStyleKey(value: string | null): value is MapStyleKey {
  return !!value && Object.prototype.hasOwnProperty.call(MAP_TILES, value);
}

function getInitialMapStyle(): MapStyleKey {
  try {
    const storedStyle = localStorage.getItem(MAP_STYLE_KEY);
    return isMapStyleKey(storedStyle) ? storedStyle : 'satellite';
  } catch {
    return 'satellite';
  }
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidLatLng(lat: unknown, lng: unknown): lat is number {
  return isFiniteCoordinate(lat) && isFiniteCoordinate(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/* ── helpers ─────────────────────────────────────────── */

/** Smoothly animate a Leaflet marker between two positions (Apple Maps style) */
function animateMarker(marker: L.Marker, from: L.LatLng, to: L.LatLng, duration = 800) {
  const start = performance.now();
  const fromLat = from.lat, fromLng = from.lng;
  const dLat = to.lat - fromLat, dLng = to.lng - fromLng;
  
  function step(now: number) {
    const t = Math.min((now - start) / duration, 1);
    // ease-out cubic
    const ease = 1 - Math.pow(1 - t, 3);
    marker.setLatLng([fromLat + dLat * ease, fromLng + dLng * ease]);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function friendName(loc?: Partial<LocationRecord> | null) {
  return loc?.profile?.display_name || loc?.profile?.username || 'Friend';
}

function friendUsername(loc?: Partial<LocationRecord> | null) {
  return loc?.profile?.username || null;
}

function initial(name: string) {
  return name.trim().charAt(0).toUpperCase() || '?';
}

function esc(v: string) {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function timeSince(dateStr: string) {
  const ms = Date.now() - new Date(dateStr).getTime();
  if (ms < 60_000) return 'now';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h`;
  return `${Math.floor(ms / 86_400_000)}d`;
}

function distanceBetween(a: [number, number], b: [number, number]) {
  const R = 3958.8;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function autoStatus(speed: number | null, hour: number): string | null {
  if (speed && speed > 25) return '✈️ Traveling';
  if (speed && speed > 2) return '🚗 Driving';
  if (speed && speed > 0.5) return '🚶 Walking';
  if (hour >= 0 && hour < 6) return '😴 Sleeping';
  return null;
}

function getActivityFromSpeed(speed?: number | null): { label: string; icon: string; color: string } {
  if (!speed || speed < 0.3) return { label: 'Stationary', icon: '⏸️', color: 'text-muted-foreground' };
  if (speed < 2) return { label: 'Walking', icon: '🚶', color: 'text-green-400' };
  if (speed < 15) return { label: 'Driving', icon: '🚗', color: 'text-blue-400' };
  return { label: 'Traveling', icon: '✈️', color: 'text-purple-400' };
}

function speedToMph(speed?: number | null): string | null {
  if (!speed || speed < 0.3) return null;
  return `${Math.round(speed * 2.237)} mph`;
}

function friendIcon(f: LocationRecord, selected: boolean) {
  const name = esc(friendName(f));
  const avatar = f.profile?.avatar_url ? esc(f.profile.avatar_url) : null;
  const isRecent = (Date.now() - new Date(f.updated_at).getTime()) < 300_000;
  const isMoving = (f.speed || 0) > 0.5;
  const activity = getActivityFromSpeed(f.speed);
  return L.divIcon({
    className: 'friend-map-marker',
    iconSize: [60, 78],
    iconAnchor: [30, 74],
    html: `<div class="vfm ${selected ? 'sel' : ''} ${isMoving ? 'moving' : ''}" aria-label="${name}">
      <div class="vfm-ring ${isRecent ? (isMoving ? 'active' : 'online') : 'away'}"></div>
      ${avatar ? `<img src="${avatar}" alt="${name}" class="vfm-av"/>` : `<span class="vfm-in">${initial(name)}</span>`}
      <span class="vfm-activity-dot ${isMoving ? 'moving' : ''}">${activity.icon}</span>
      <span class="vfm-arrow"></span>
    </div>
    <div class="vfm-label">${name.split(' ')[0]}</div>`,
  });
}

function clusterIcon(count: number, avatars: string[]) {
  const imgs = avatars.slice(0, 3).map((a, i) =>
    `<img src="${esc(a)}" class="vfm-cluster-av" style="z-index:${3 - i};transform:translateX(${i * -8}px)" />`
  ).join('');
  return L.divIcon({
    className: 'friend-map-marker',
    iconSize: [64, 64],
    iconAnchor: [32, 32],
    html: `<div class="vfm-cluster">
      <div class="vfm-cluster-stack">${imgs}</div>
      <span class="vfm-cluster-count">${count}</span>
    </div>`,
  });
}

function myIcon() {
  return L.divIcon({
    className: 'my-location-marker',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    html: `<div class="vme"><span class="vme-ring"></span><span class="vme-p"></span><span class="vme-d"></span></div>`,
  });
}

/* ── data hooks ──────────────────────────────────────── */

function useFriendIds(profileId?: string) {
  return useQuery({
    queryKey: ['friend-map-ids', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!profileId) return [] as string[];
      const [s, r] = await Promise.all([
        supabase.from('friend_requests').select('receiver_id').eq('sender_id', profileId).eq('status', 'accepted'),
        supabase.from('friend_requests').select('sender_id').eq('receiver_id', profileId).eq('status', 'accepted'),
      ]);
      if (s.error) throw s.error;
      if (r.error) throw r.error;
      return Array.from(new Set([
        ...(s.data || []).map((x) => x.receiver_id),
        ...(r.data || []).map((x) => x.sender_id),
      ]));
    },
  });
}

function useFriendLocations(friendIds: string[]) {
  return useQuery({
    queryKey: ['friend-locations', [...friendIds].sort().join(':')],
    enabled: friendIds.length > 0,
    staleTime: 10_000,
    queryFn: async (): Promise<LocationRecord[]> => {
      if (!friendIds.length) return [];
      const { data: locationRows, error } = await supabase
        .from('user_locations')
        .select('id, user_id, latitude, longitude, accuracy, label, updated_at, expires_at, sharing_enabled, status, speed')
        .in('user_id', friendIds)
        .eq('sharing_enabled', true);
      if (error) throw error;

      const validLocations = (locationRows || []).filter((row) => isValidLatLng(row.latitude, row.longitude));
      if (!validLocations.length) return [];

      const profileIds = Array.from(new Set(validLocations.map((row) => row.user_id)));
      const { data: profileRows } = await supabase
        .from('public_profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', profileIds);

      const profilesById = new Map(
        ((profileRows || []) as PublicProfileSummary[]).map((profile) => [profile.id, profile])
      );

      return validLocations.map((row) => {
        const profile = profilesById.get(row.user_id);
        return {
          ...row,
          profile: profile
            ? {
                username: profile.username,
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
              }
            : null,
        };
      }) as LocationRecord[];
    },
  });
}

/* ── search hook ─────────────────────────────────────── */

function useNominatimSearch(myCoords: [number, number] | null) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [nearby, setNearby] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>();
  const nearbyLoaded = useRef(false);

  // Load nearby places when coords become available
  useEffect(() => {
    if (!myCoords || nearbyLoaded.current) return;
    nearbyLoaded.current = true;
    (async () => {
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
      const categories = ['restaurant', 'cafe', 'gas station', 'grocery', 'pharmacy'];
      const all: any[] = [];
      for (const cat of categories) {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=2&q=${encodeURIComponent(cat)}&viewbox=${myCoords[1] - 0.05},${myCoords[0] + 0.05},${myCoords[1] + 0.05},${myCoords[0] - 0.05}&bounded=1`
          );
          const data = await res.json();
          all.push(...data);
          await delay(1100);
        } catch { /* skip */ }
      }
      all.sort((a: any, b: any) => {
        const da = distanceBetween(myCoords!, [parseFloat(a.lat), parseFloat(a.lon)]);
        const db = distanceBetween(myCoords!, [parseFloat(b.lat), parseFloat(b.lon)]);
        return da - db;
      });
      setNearby(all.slice(0, 8));
    })();
  }, [myCoords]);

  const search = useCallback((q: string) => {
    setQuery(q);
    clearTimeout(debounce.current);
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      try {
        const locBias = myCoords
          ? `&viewbox=${myCoords[1] - 0.5},${myCoords[0] + 0.5},${myCoords[1] + 0.5},${myCoords[0] - 0.5}&bounded=0`
          : '';
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}${locBias}`
        );
        const data = await res.json();
        // Sort results by distance if we have coords
        if (myCoords && data?.length) {
          data.sort((a: any, b: any) => {
            const da = distanceBetween(myCoords, [parseFloat(a.lat), parseFloat(a.lon)]);
            const db = distanceBetween(myCoords, [parseFloat(b.lat), parseFloat(b.lon)]);
            return da - db;
          });
        }
        setResults(data || []);
      } catch { setResults([]); }
      setLoading(false);
    }, 400);
  }, [myCoords]);

  const clear = useCallback(() => { setQuery(''); setResults([]); }, []);

  return { query, results, nearby, loading, search, clear };
}

/* ── component ───────────────────────────────────────── */

export default function FriendMap() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { coords: myCoords, accuracy, sharing, setSharing, speed: mySpeed } = useLocationContext();

  const { data: friendIds = [] } = useFriendIds(profile?.id);
  const { data: friends = [] } = useFriendLocations(friendIds);

  // Map refs
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fLayer = useRef<L.LayerGroup | null>(null);
  const myMk = useRef<L.Marker | null>(null);
  const accCircle = useRef<L.Circle | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const framed = useRef(false);
  const clusterMarkerRefs = useRef<L.Marker[]>([]);
  const friendMarkers = useRef<Map<string, L.Marker>>(new Map());

  // State
  const [selId, setSelId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [stylesOpen, setStylesOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>(getInitialMapStyle);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const safeMyCoords = useMemo(
    () => (myCoords && isValidLatLng(myCoords[0], myCoords[1]) ? myCoords : null),
    [myCoords]
  );
  const friendsArr = useMemo(
    () => (Array.isArray(friends) ? friends.filter((friend) => isValidLatLng(friend.latitude, friend.longitude)) : []),
    [friends]
  );
  const sel = useMemo(() => friendsArr.find((f) => f.user_id === selId) || null, [friendsArr, selId]);

  const sortedFriends = useMemo(() => {
    if (!safeMyCoords) return friendsArr;
    return [...friendsArr].sort((a, b) => {
      const da = distanceBetween(safeMyCoords, [a.latitude, a.longitude]);
      const db = distanceBetween(safeMyCoords, [b.latitude, b.longitude]);
      return da - db;
    });
  }, [friendsArr, safeMyCoords]);

  // Simple clustering: group friends within ~0.005 degrees at low zoom
  const clusteredMarkers = useMemo(() => {
    if (zoom >= 13) return { singles: friendsArr, clusters: [] as { center: [number, number]; members: LocationRecord[] }[] };
    const used = new Set<string>();
    const clusters: { center: [number, number]; members: LocationRecord[] }[] = [];
    const singles: LocationRecord[] = [];
    const threshold = zoom < 8 ? 2 : zoom < 10 ? 0.5 : 0.1;

    friendsArr.forEach((f) => {
      if (used.has(f.user_id)) return;
      const nearby = friendsArr.filter((o) => !used.has(o.user_id) && o.user_id !== f.user_id &&
        Math.abs(o.latitude - f.latitude) < threshold && Math.abs(o.longitude - f.longitude) < threshold
      );
      if (nearby.length > 0) {
        const members = [f, ...nearby];
        members.forEach((m) => used.add(m.user_id));
        const cLat = members.reduce((s, m) => s + m.latitude, 0) / members.length;
        const cLng = members.reduce((s, m) => s + m.longitude, 0) / members.length;
        clusters.push({ center: [cLat, cLng], members });
      } else {
        used.add(f.user_id);
        singles.push(f);
      }
    });

    return { singles, clusters };
  }, [friendsArr, zoom]);

  const { query: searchQuery, results: searchResults, nearby: nearbyPlaces, loading: searchLoading, search: doSearch, clear: clearSearch } = useNominatimSearch(safeMyCoords);

  /* ── location tracking is handled by LocationProvider ── */

  /* ── realtime subscription ─────────────────────────── */

  useEffect(() => {
    if (!friendIds.length) return;
    const channel = supabase
      .channel('friend-locations-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_locations' },
        (payload) => {
          const rec = payload.new as any;
          if (!rec?.user_id || !friendIds.includes(rec.user_id)) return;
          qc.invalidateQueries({ queryKey: ['friend-locations'] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [friendIds, qc]);

  /* ── toggle handler ────────────────────────────────── */

  const toggleSharing = useCallback(() => {
    const next = !sharing;
    setSharing(next);
    triggerHaptic('medium');
    toast.success(next ? 'Live location on 📍' : 'Ghost Mode enabled 👻');
    setGhostOpen(false);
  }, [sharing, setSharing]);

  const focus = useCallback((f: LocationRecord) => {
    if (!isValidLatLng(f.latitude, f.longitude)) return;
    setSelId(f.user_id);
    mapRef.current?.flyTo([f.latitude, f.longitude], FRIEND_FOCUS_ZOOM, { duration: 1.2 });
    triggerHaptic('light');
  }, []);

  const recenter = useCallback(() => {
    if (!safeMyCoords) return;
    mapRef.current?.flyTo(safeMyCoords, MY_LOCATION_ZOOM, { duration: 1 });
    triggerHaptic('light');
  }, [safeMyCoords]);

  const changeMapStyle = useCallback((style: string) => {
    if (!isMapStyleKey(style)) return;
    setMapStyle(style);
    try {
      localStorage.setItem(MAP_STYLE_KEY, style);
    } catch {
      // Ignore storage failures and keep the in-memory style.
    }
    if (tileRef.current && mapRef.current) {
      tileRef.current.remove();
      tileRef.current = L.tileLayer(MAP_TILES[style].url, { maxZoom: 19 }).addTo(mapRef.current);
    }
    setStylesOpen(false);
    triggerHaptic('light');
  }, []);

  const flyToSearch = useCallback((r: SearchResult) => {
    mapRef.current?.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 14, { duration: 1.5 });
    setSearchOpen(false);
    clearSearch();
    triggerHaptic('light');
  }, [clearSearch]);

  /* ── leaflet lifecycle ─────────────────────────────── */

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const safeInvalidateSize = () => {
      if (mapRef.current !== map) return;
      try {
        map.invalidateSize();
      } catch {
        // Ignore invalidation during teardown.
      }
    };
    const map = L.map(mapEl.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 19,
      worldCopyJump: true,
      zoomAnimation: true,
      markerZoomAnimation: true,
      inertia: true,
      inertiaDeceleration: 2000,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    tileRef.current = L.tileLayer(MAP_TILES[mapStyle].url, { maxZoom: 19 }).addTo(map);
    fLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const rafId = requestAnimationFrame(safeInvalidateSize);
    const timeoutIds = [window.setTimeout(safeInvalidateSize, 100), window.setTimeout(safeInvalidateSize, 500)];
    // Invalidate size multiple times to handle desktop layout settling
    safeInvalidateSize();

    // Use ResizeObserver to handle layout changes (e.g. sidebar appearing)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(safeInvalidateSize) : null;
    ro?.observe(mapEl.current);

    map.on('click', () => { setSelId(null); setStylesOpen(false); });
    map.on('zoomend', () => setZoom(map.getZoom()));

    return () => {
      cancelAnimationFrame(rafId);
      timeoutIds.forEach((id) => window.clearTimeout(id));
      ro?.disconnect();
      fLayer.current?.clearLayers();
      myMk.current?.remove();
      accCircle.current?.remove();
      map.remove();
      fLayer.current = null;
      myMk.current = null;
      accCircle.current = null;
      mapRef.current = null;
      tileRef.current = null;
    };
  }, []);

  /* ── update my marker + accuracy circle ────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!safeMyCoords) {
      myMk.current?.remove(); myMk.current = null;
      accCircle.current?.remove(); accCircle.current = null;
      return;
    }
    if (accuracy && accuracy < 500) {
      if (!accCircle.current) {
        accCircle.current = L.circle(safeMyCoords, {
          radius: accuracy,
          fillColor: 'hsl(217, 91%, 60%)',
          fillOpacity: 0.08,
          stroke: true,
          color: 'hsl(217, 91%, 60%)',
          weight: 1,
          opacity: 0.25,
          interactive: false,
        }).addTo(map);
      } else {
        accCircle.current.setLatLng(safeMyCoords);
        accCircle.current.setRadius(accuracy);
      }
    }
    if (!myMk.current) {
      myMk.current = L.marker(safeMyCoords, { icon: myIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    } else {
      // Smooth animation for own marker (Apple Maps style)
      const old = myMk.current.getLatLng();
      if (old.lat !== safeMyCoords[0] || old.lng !== safeMyCoords[1]) {
        animateMarker(myMk.current, old, L.latLng(safeMyCoords[0], safeMyCoords[1]));
      }
    }
  }, [safeMyCoords, accuracy]);

  /* ── friend markers (smooth animation) ──────────────── */

  useEffect(() => {
    const layer = fLayer.current;
    if (!layer) return;

    // Clean up old cluster markers first
    clusterMarkerRefs.current.forEach((m) => { try { layer.removeLayer(m); } catch {} });
    clusterMarkerRefs.current = [];

    // Track which markers are still present
    const currentIds = new Set<string>();

    // Smooth animate individual markers
    clusteredMarkers.singles.forEach((f) => {
      currentIds.add(f.user_id);
      const newPos = L.latLng(f.latitude, f.longitude);
      const existing = friendMarkers.current.get(f.user_id);

      if (existing) {
        const oldPos = existing.getLatLng();
        if (oldPos.lat !== newPos.lat || oldPos.lng !== newPos.lng) {
          animateMarker(existing, oldPos, newPos);
        }
        existing.setIcon(friendIcon(f, f.user_id === selId));
      } else {
        const marker = L.marker(newPos, { icon: friendIcon(f, f.user_id === selId), keyboard: false })
          .on('click', () => focus(f))
          .addTo(layer);
        friendMarkers.current.set(f.user_id, marker);
      }
    });

    // Render clusters
    clusteredMarkers.clusters.forEach((c) => {
      c.members.forEach(m => {
        const existing = friendMarkers.current.get(m.user_id);
        if (existing) { layer.removeLayer(existing); friendMarkers.current.delete(m.user_id); }
      });
      const avatars = c.members.map((m) => m.profile?.avatar_url || '').filter(Boolean);
      const clusterMk = L.marker(c.center, { icon: clusterIcon(c.members.length, avatars), keyboard: false })
        .on('click', () => {
          mapRef.current?.flyTo(c.center, Math.min((zoom || 10) + 3, 16), { duration: 1 });
        })
        .addTo(layer);
      clusterMarkerRefs.current.push(clusterMk);
    });

    // Remove markers for friends no longer present
    friendMarkers.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        layer.removeLayer(marker);
        friendMarkers.current.delete(id);
      }
    });
  }, [clusteredMarkers, selId, focus, zoom]);

  /* ── initial framing ───────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || framed.current) return;
    const pts: [number, number][] = [...friendsArr.map((f) => [f.latitude, f.longitude] as [number, number]), ...(safeMyCoords ? [safeMyCoords] : [])];
    if (!pts.length) return;
    framed.current = true;
    if (pts.length === 1) { map.flyTo(pts[0], safeMyCoords ? MY_LOCATION_ZOOM : 12, { duration: 1.2 }); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14, animate: true });
  }, [safeMyCoords, friendsArr]);

  /* ── render ────────────────────────────────────────── */

  return (
    <AppLayout hideNav noPadding>
      <div className="fixed inset-0 md:absolute md:inset-0 w-full h-full overflow-hidden bg-background" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
        <style>{`
          @keyframes pulse-ring{0%{transform:scale(.8);opacity:1}100%{transform:scale(3);opacity:0}}
          @keyframes pulse-glow{0%,100%{box-shadow:0 0 0 0 hsl(217 91% 60%/.4)}50%{box-shadow:0 0 20px 8px hsl(217 91% 60%/.2)}}
          @keyframes bounce-in{0%{transform:scale(0) translateY(20px);opacity:0}60%{transform:scale(1.1) translateY(-4px);opacity:1}100%{transform:scale(1) translateY(0);opacity:1}}
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
          @keyframes ring-pulse{0%,100%{opacity:.7}50%{opacity:1}}
          @keyframes moving-glow{0%,100%{box-shadow:0 0 8px 2px hsl(142 76% 56%/.3)}50%{box-shadow:0 0 20px 6px hsl(142 76% 56%/.15)}}
          .friend-map-marker,.my-location-marker{background:transparent!important;border:none!important}
          .leaflet-container{height:100%;width:100%;background:#0a0a0a;font-family:inherit}
          .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
          
          .vfm{position:relative;display:flex;height:52px;width:52px;align-items:center;justify-content:center;overflow:visible;border-radius:9999px;background:hsl(var(--card));box-shadow:0 8px 32px -8px rgba(0,0,0,.6);animation:bounce-in .5s cubic-bezier(.34,1.56,.64,1) both;transition:transform .3s ease}
          .vfm.sel{transform:scale(1.15);animation:float 2s ease-in-out infinite}
          .vfm.moving{animation:moving-glow 2s ease-in-out infinite,bounce-in .5s cubic-bezier(.34,1.56,.64,1) both}
          .vfm-ring{position:absolute;inset:-4px;border-radius:9999px;border:3px solid transparent}
          .vfm-ring.active{border-image:linear-gradient(135deg,#22c55e,#10b981,#06b6d4) 1;border-color:#22c55e;animation:ring-pulse 2s ease-in-out infinite}
          .vfm-ring.online{border-color:#22c55e}
          .vfm-ring.away{border-color:hsl(var(--muted-foreground)/.3)}
          .vfm-av{height:100%;width:100%;object-fit:cover;border-radius:9999px}
          .vfm-in{font-size:16px;font-weight:800;color:hsl(var(--foreground))}
          .vfm-activity-dot{position:absolute;bottom:-2px;right:-2px;font-size:12px;height:22px;width:22px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:hsl(var(--card));border:2px solid hsl(var(--background));box-shadow:0 2px 6px rgba(0,0,0,.3)}
          .vfm-activity-dot.moving{background:hsl(142 76% 56%/.15)}
          .vfm-arrow{position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid hsl(var(--card))}
          .vfm.sel .vfm-arrow{border-top-color:hsl(var(--primary))}
          .vfm-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;white-space:nowrap;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8),0 0 2px rgba(0,0,0,.6);pointer-events:none}
          
          .vfm-cluster{display:flex;flex-direction:column;align-items:center;justify-content:center;height:56px;width:56px;border-radius:9999px;background:hsl(var(--card)/.9);border:3px solid hsl(var(--primary)/.5);box-shadow:0 8px 32px -8px rgba(0,0,0,.6);animation:bounce-in .5s cubic-bezier(.34,1.56,.64,1) both;backdrop-filter:blur(8px)}
          .vfm-cluster-stack{display:flex;align-items:center;justify-content:center;margin-bottom:2px}
          .vfm-cluster-av{height:20px;width:20px;border-radius:9999px;border:2px solid hsl(var(--card));object-fit:cover}
          .vfm-cluster-count{font-size:11px;font-weight:800;color:hsl(var(--primary))}
          
          .vme{position:relative;display:flex;height:44px;width:44px;align-items:center;justify-content:center}
          .vme-ring{position:absolute;inset:-4px;border-radius:9999px;border:2px solid hsl(217 91% 60%/.3);animation:pulse-ring 2s ease-out infinite}
          .vme-p{position:absolute;inset:4px;border-radius:9999px;background:hsl(217 91% 60%/.15);animation:pulse-ring 2.5s ease-out infinite .5s}
          .vme-d{position:relative;z-index:1;height:18px;width:18px;border-radius:9999px;border:3px solid hsl(var(--background));background:hsl(217 91% 60%);box-shadow:0 0 12px 4px hsl(217 91% 60%/.35);animation:pulse-glow 2s ease-in-out infinite}
          
          .map-vignette{pointer-events:none;position:absolute;inset:0;z-index:500;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.3) 100%)}
          .scrollbar-hide::-webkit-scrollbar{display:none}
          .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>

        {/* Map container */}
        <div ref={mapEl} className="absolute inset-0" />
        <div className="map-vignette" />

        {/* ── Top bar ─────────────────────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-4 pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <motion.button
              onClick={() => navigate(-1)}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>

            <div className="flex-1" />

            {/* Search button */}
            <motion.button
              onClick={() => { setSearchOpen(true); triggerHaptic('light'); }}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl"
            >
              <Search className="h-4 w-4" />
            </motion.button>

            {/* Map style button */}
            <motion.button
              onClick={() => { setStylesOpen(!stylesOpen); triggerHaptic('light'); }}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl"
            >
              <Layers className="h-4 w-4" />
            </motion.button>

            {/* Accuracy indicator */}
            {sharing && accuracy && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur-xl"
              >
                <span className={cn(
                  'h-2 w-2 rounded-full',
                  accuracy < 20 ? 'bg-green-400' : accuracy < 100 ? 'bg-yellow-400' : 'bg-red-400'
                )} />
                <span className="text-[11px] font-medium text-white/80">{Math.round(accuracy)}m</span>
              </motion.div>
            )}

            <motion.button
              onClick={recenter}
                disabled={!safeMyCoords}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl disabled:opacity-30"
            >
              <Navigation className="h-4.5 w-4.5" />
            </motion.button>
          </div>
        </div>

        {/* ── Map style picker ───────────────────────── */}
        <AnimatePresence>
          {stylesOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="pointer-events-auto absolute right-4 z-[1001] rounded-2xl bg-black/70 p-2 backdrop-blur-2xl border border-white/10"
              style={{ top: 'calc(max(env(safe-area-inset-top), 16px) + 52px)' }}
            >
              {Object.entries(MAP_TILES).map(([key, tile]) => (
                <button
                  key={key}
                  onClick={() => changeMapStyle(key)}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all',
                    mapStyle === key ? 'bg-primary/20 text-white' : 'text-white/70 hover:bg-white/10'
                  )}
                >
                  <span className="text-lg">{tile.icon}</span>
                  <span className="text-sm font-medium">{tile.label}</span>
                  {mapStyle === key && <span className="ml-auto text-xs text-primary">✓</span>}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Search overlay ─────────────────────────── */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="pointer-events-auto absolute inset-x-4 z-[1002] rounded-2xl bg-black/80 backdrop-blur-2xl border border-white/10 overflow-hidden"
              style={{ top: 'calc(max(env(safe-area-inset-top), 16px) + 4px)' }}
            >
              <div className="flex items-center gap-2 p-3">
                <Search className="h-4 w-4 text-white/50 shrink-0" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => doSearch(e.target.value)}
                  placeholder="Search places..."
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
                  autoFocus
                />
                <button onClick={() => { setSearchOpen(false); clearSearch(); }} className="p-1">
                  <X className="h-4 w-4 text-white/50" />
                </button>
              </div>
              {searchResults.length > 0 && (
                <div className="border-t border-white/10 max-h-60 overflow-y-auto">
                  {searchResults.map((r) => (
                    <div
                      key={`${r.lat}-${r.lon}`}
                      className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-white/5 transition-colors"
                    >
                      <button
                        onClick={() => flyToSearch(r)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                      >
                        <MapPin className="h-3.5 w-3.5 text-white/40 shrink-0" />
                        <span className="text-xs text-white/80 truncate">{r.display_name}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`, '_blank');
                          setSearchOpen(false);
                          clearSearch();
                        }}
                        className="shrink-0 flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/30 transition-colors"
                      >
                        <Navigation className="h-3 w-3" />
                        Directions
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {searchLoading && (
                <div className="border-t border-white/10 p-3 text-center text-xs text-white/40">Searching...</div>
              )}
              {/* Nearby suggestions when no query */}
              {!searchQuery && nearbyPlaces.length > 0 && (
                <div className="border-t border-white/10">
                  <p className="px-3 pt-2.5 pb-1 text-[10px] font-semibold text-white/30 uppercase tracking-wider">Nearby</p>
                  {nearbyPlaces.map((r, i) => {
                    const dist = safeMyCoords ? distanceBetween(safeMyCoords, [parseFloat(r.lat), parseFloat(r.lon)]).toFixed(1) : null;
                    return (
                      <div key={`${r.lat}-${r.lon}`} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors">
                        <button
                          onClick={() => flyToSearch(r)}
                          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                        >
                          <MapPin className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <span className="text-xs text-white/80 truncate block">{r.display_name}</span>
                            {dist && <span className="text-[10px] text-white/40">{dist} mi away</span>}
                          </div>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}`, '_blank');
                          }}
                          className="shrink-0 flex items-center gap-1 rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary hover:bg-primary/30 transition-colors"
                        >
                          <Navigation className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Ghost Mode FAB ─────────────────────────── */}
        <div className="pointer-events-none absolute right-4 z-[1000]" style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 180px), 196px)' }}>
          <motion.button
            onClick={() => { setGhostOpen(!ghostOpen); triggerHaptic('light'); }}
            whileTap={{ scale: 0.9 }}
            className={cn(
              'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all',
              sharing
                ? 'bg-primary text-primary-foreground'
                : 'bg-black/60 text-white backdrop-blur-xl border border-white/20'
            )}
          >
            {sharing ? (
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MapPin className="h-6 w-6" />
              </motion.div>
            ) : (
              <Ghost className="h-6 w-6 opacity-80" />
            )}
          </motion.button>
          {!sharing && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/30"
            />
          )}
        </div>

        {/* ── Ghost Mode sheet ───────────────────────── */}
        <AnimatePresence>
          {ghostOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-auto absolute inset-0 z-[1003] bg-black/40"
                onClick={() => setGhostOpen(false)}
              />
              <motion.div
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="pointer-events-auto absolute inset-x-0 bottom-0 z-[1004] rounded-t-3xl bg-black/80 backdrop-blur-2xl border-t border-white/10"
                style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
              >
                <div className="flex justify-center pt-3 pb-1">
                  <div className="w-10 h-1.5 rounded-full bg-white/20" />
                </div>
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <Ghost className="h-6 w-6 text-white" />
                    <div>
                      <h3 className="text-base font-bold text-white">Ghost Mode</h3>
                      <p className="text-xs text-white/50">Control who can see your location</p>
                    </div>
                  </div>

                  <button
                    onClick={toggleSharing}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl p-4 transition-all',
                      !sharing ? 'bg-primary/20 border border-primary/40' : 'bg-white/5 border border-white/10'
                    )}
                  >
                    <Ghost className={cn('h-5 w-5', !sharing ? 'text-primary' : 'text-white/50')} />
                    <div className="text-left flex-1">
                      <p className={cn('text-sm font-semibold', !sharing ? 'text-primary' : 'text-white/70')}>Ghost Mode</p>
                      <p className="text-[11px] text-white/40">Nobody can see your location</p>
                    </div>
                    {!sharing && <span className="text-primary text-xs font-bold">Active</span>}
                  </button>

                  <button
                    onClick={toggleSharing}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-2xl p-4 transition-all',
                      sharing ? 'bg-green-500/20 border border-green-500/40' : 'bg-white/5 border border-white/10'
                    )}
                  >
                    <MapPin className={cn('h-5 w-5', sharing ? 'text-green-400' : 'text-white/50')} />
                    <div className="text-left flex-1">
                      <p className={cn('text-sm font-semibold', sharing ? 'text-green-400' : 'text-white/70')}>My Friends</p>
                      <p className="text-[11px] text-white/40">Only friends can see your location</p>
                    </div>
                    {sharing && <span className="text-green-400 text-xs font-bold">Active</span>}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Bottom panel ─────────────────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] pb-[max(env(safe-area-inset-bottom),12px)]">
          <div className="mx-auto max-w-lg space-y-2 px-4">

            {/* Selected friend card (Life360-inspired) */}
            <AnimatePresence>
              {sel && (() => {
                const activity = getActivityFromSpeed(sel.speed);
                const mph = speedToMph(sel.speed);
                const isLive = (Date.now() - new Date(sel.updated_at).getTime()) < 300_000;
                const dist = safeMyCoords ? distanceBetween(safeMyCoords, [sel.latitude, sel.longitude]).toFixed(1) : null;
                return (
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="pointer-events-auto rounded-3xl bg-black/70 p-4 shadow-2xl backdrop-blur-2xl border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    {/* Tappable avatar with activity ring */}
                    <button
                      onClick={() => { const u = friendUsername(sel); if (u) navigate(`/u/${u}`); }}
                      className="relative shrink-0"
                    >
                      <div className={cn(
                        'h-16 w-16 rounded-full p-[3px]',
                        isLive && (sel.speed || 0) > 0.5
                          ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-cyan-500'
                          : isLive ? 'bg-green-500' : 'bg-muted-foreground/30'
                      )}>
                        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/90">
                          {sel.profile?.avatar_url ? (
                            <img src={sel.profile.avatar_url} alt={friendName(sel)} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-lg font-bold text-white">{initial(friendName(sel))}</span>
                          )}
                        </div>
                      </div>
                      <span className="absolute -bottom-1 -right-1 text-base">{activity.icon}</span>
                    </button>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{friendName(sel)}</p>
                      <p className="truncate text-xs text-white/50">
                        {friendUsername(sel) ? `@${friendUsername(sel)}` : ''}
                        {' · '}
                        {isLive ? '📍 Live' : `${timeSince(sel.updated_at)} ago`}
                      </p>
                      {/* Activity badge */}
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold',
                          (sel.speed || 0) > 2 ? 'bg-blue-500/20 text-blue-300' :
                          (sel.speed || 0) > 0.5 ? 'bg-green-500/20 text-green-300' :
                          'bg-white/10 text-white/50'
                        )}>
                          {activity.label}
                          {mph && ` · ${mph}`}
                        </span>
                        {dist && (
                          <span className="text-[10px] text-white/40">{dist} mi</span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelId(null)}
                      className="p-1.5 rounded-full hover:bg-white/10 transition-colors self-start"
                    >
                      <X className="h-4 w-4 text-white/40" />
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2 mt-3">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        const lat = sel.latitude;
                        const lng = sel.longitude;
                        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
                        const isAndroid = /Android/i.test(navigator.userAgent);
                        if (isIOS) {
                          // Apple Maps deep link — falls back to Google Maps in browser
                          window.location.href = `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`;
                        } else if (isAndroid) {
                          // geo: intent opens user's preferred maps app
                          window.location.href = `geo:${lat},${lng}?q=${lat},${lng}`;
                        } else {
                          window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
                        }
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                      Navigate
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => navigate(`/messages`)}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Message
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { const u = friendUsername(sel); if (u) navigate(`/u/${u}`); }}
                      disabled={!friendUsername(sel)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"
                    >
                      <User className="h-3.5 w-3.5" />
                    </motion.button>
                  </div>
                </motion.div>
                );
              })()}
            </AnimatePresence>

            {/* Horizontal friend strip */}
            {sortedFriends.length > 0 ? (
              <div className="pointer-events-auto -mx-1 flex gap-3 overflow-x-auto px-1 py-1 scrollbar-hide">
                {sortedFriends.map((f, i) => {
                  const isRecent = (Date.now() - new Date(f.updated_at).getTime()) < 300_000;
                  const isSelected = sel?.user_id === f.user_id;
                  const isMoving = (f.speed || 0) > 0.5;
                  const fActivity = getActivityFromSpeed(f.speed);
                  return (
                    <motion.button
                      key={f.user_id}
                      onClick={() => focus(f)}
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05, type: 'spring', damping: 20 }}
                      className="flex shrink-0 flex-col items-center gap-1"
                    >
                      <div className={cn(
                        'relative h-14 w-14 rounded-full p-[3px] transition-all',
                        isSelected ? 'bg-gradient-to-br from-primary to-primary/60'
                          : isMoving ? 'bg-gradient-to-br from-green-400 via-emerald-500 to-cyan-500'
                          : isRecent ? 'bg-green-500'
                          : 'bg-white/20'
                      )}>
                        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/80">
                          {f.profile?.avatar_url ? (
                            <img src={f.profile.avatar_url} alt={friendName(f)} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-sm font-bold text-white">{initial(friendName(f))}</span>
                          )}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 text-xs">{fActivity.icon}</span>
                      </div>
                      <span className="max-w-[56px] truncate text-[10px] font-semibold text-white/80 text-center">
                        {friendName(f).split(' ')[0]}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-auto rounded-2xl bg-black/40 px-4 py-3 text-center backdrop-blur-xl border border-white/5"
              >
                <p className="text-sm font-semibold text-white/70">No friends sharing right now</p>
                <p className="text-[11px] text-white/40 mt-0.5">When friends go live, they'll appear here</p>
              </motion.div>
            )}

            {/* Sharing status bar */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'pointer-events-auto flex items-center gap-3 rounded-full px-4 py-2.5 backdrop-blur-xl transition-all',
                sharing ? 'bg-primary/20 border border-primary/30' : 'bg-black/40 border border-white/5'
              )}
            >
              <span className={cn(
                'h-2.5 w-2.5 rounded-full shrink-0',
                sharing ? 'bg-primary animate-pulse' : 'bg-white/30'
              )} />
              <span className="flex-1 text-xs font-medium text-white/70">
                {sharing ? 'Your live location is visible to friends' : '👻 Ghost Mode — Location hidden'}
              </span>
              <button
                onClick={toggleSharing}
                className={cn(
                  'rounded-full px-3 py-1 text-[11px] font-bold transition-all',
                  sharing ? 'bg-white/10 text-white/80' : 'bg-primary text-primary-foreground'
                )}
              >
                {sharing ? 'Stop' : 'Go Live'}
              </button>
            </motion.div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
