import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Locate, Search, MapPin, Navigation } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
  profile?: {
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

/* ── constants ───────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const DEFAULT_ZOOM = 4;
const FRIEND_FOCUS_ZOOM = 16;
const MY_LOCATION_ZOOM = 16;
const UPSERT_INTERVAL_MS = 15_000;
const SATELLITE_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SHARING_PREF_KEY = 'vybe-map-sharing';

/* ── helpers ─────────────────────────────────────────── */

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
  const R = 3958.8; // miles
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function friendIcon(f: LocationRecord, selected: boolean) {
  const name = esc(friendName(f));
  const avatar = f.profile?.avatar_url ? esc(f.profile.avatar_url) : null;
  const ts = timeSince(f.updated_at);
  const isRecent = (Date.now() - new Date(f.updated_at).getTime()) < 300_000; // 5min
  return L.divIcon({
    className: 'friend-map-marker',
    iconSize: [56, 68],
    iconAnchor: [28, 64],
    html: `<div class="vfm ${selected ? 'sel' : ''}" aria-label="${name}">
      ${avatar ? `<img src="${avatar}" alt="${name}" class="vfm-av"/>` : `<span class="vfm-in">${initial(name)}</span>`}
      <span class="vfm-status ${isRecent ? 'online' : 'away'}"></span>
      <span class="vfm-arrow"></span>
    </div>
    <div class="vfm-label">${name.split(' ')[0]}</div>`,
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
      const { data, error } = await supabase
        .from('user_locations')
        .select('id, user_id, latitude, longitude, accuracy, label, updated_at, expires_at, sharing_enabled, profile:profiles(username, display_name, avatar_url)')
        .in('user_id', friendIds)
        .eq('sharing_enabled', true);
      if (error) throw error;
      return (data || []) as unknown as LocationRecord[];
    },
  });
}

/* ── component ───────────────────────────────────────── */

export default function FriendMap() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: friendIds = [] } = useFriendIds(profile?.id);
  const { data: friends = [] } = useFriendLocations(friendIds);

  // Map refs
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fLayer = useRef<L.LayerGroup | null>(null);
  const myMk = useRef<L.Marker | null>(null);
  const accCircle = useRef<L.Circle | null>(null);
  const framed = useRef(false);
  const lastUpsert = useRef(0);

  // State
  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [sharing, setSharing] = useState(() => localStorage.getItem(SHARING_PREF_KEY) === 'true');
  const [selId, setSelId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const sel = useMemo(() => friends.find((f) => f.user_id === selId) || null, [friends, selId]);

  // Sort friends by proximity
  const sortedFriends = useMemo(() => {
    if (!myCoords) return friends;
    return [...friends].sort((a, b) => {
      const da = distanceBetween(myCoords, [a.latitude, a.longitude]);
      const db = distanceBetween(myCoords, [b.latitude, b.longitude]);
      return da - db;
    });
  }, [friends, myCoords]);

  /* ── upsert location to DB (debounced) ─────────────── */

  const upsertLocation = useCallback(async (lat: number, lng: number, acc: number) => {
    if (!profile?.id || !sharing) return;
    const now = Date.now();
    if (now - lastUpsert.current < UPSERT_INTERVAL_MS) return;
    lastUpsert.current = now;
    await supabase
      .from('user_locations')
      .upsert({
        user_id: profile.id,
        latitude: lat,
        longitude: lng,
        accuracy: acc,
        sharing_enabled: true,
      }, { onConflict: 'user_id' });
  }, [profile?.id, sharing]);

  /* ── watchPosition lifecycle ───────────────────────── */

  useEffect(() => {
    if (!sharing) return;
    let watchId: number | undefined;

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
          setMyCoords(coords);
          setAccuracy(pos.coords.accuracy);
          upsertLocation(coords[0], coords[1], pos.coords.accuracy);
        },
        (err) => {
          console.warn('Geolocation error:', err.message);
          if (err.code === 1) {
            toast.error('Location permission denied');
            setSharing(false);
            localStorage.setItem(SHARING_PREF_KEY, 'false');
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
      );
    } catch {
      // geolocation not available
    }

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [sharing, upsertLocation]);

  /* ── disable sharing in DB when toggled off ────────── */

  useEffect(() => {
    if (sharing || !profile?.id) return;
    supabase
      .from('user_locations')
      .update({ sharing_enabled: false })
      .eq('user_id', profile.id)
      .then();
  }, [sharing, profile?.id]);

  /* ── realtime subscription for friend locations ────── */

  useEffect(() => {
    if (!friendIds.length) return;

    const channel = supabase
      .channel('friend-locations-rt')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_locations' },
        (payload) => {
          const rec = payload.new as any;
          if (!rec?.user_id || !friendIds.includes(rec.user_id)) return;
          // Invalidate to refresh friend list
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
    localStorage.setItem(SHARING_PREF_KEY, String(next));
    triggerHaptic('medium');
    toast.success(next ? 'Live location on 📍' : 'Location sharing off');
    if (next) {
      // Force immediate upsert
      lastUpsert.current = 0;
    }
  }, [sharing]);

  const focus = useCallback((f: LocationRecord) => {
    setSelId(f.user_id);
    setDrawerOpen(false);
    mapRef.current?.flyTo([f.latitude, f.longitude], FRIEND_FOCUS_ZOOM, { duration: 1.2 });
    triggerHaptic('light');
  }, []);

  const recenter = useCallback(() => {
    if (!myCoords) return;
    mapRef.current?.flyTo(myCoords, MY_LOCATION_ZOOM, { duration: 1 });
    triggerHaptic('light');
  }, [myCoords]);

  /* ── leaflet lifecycle ─────────────────────────────── */

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
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
    L.tileLayer(SATELLITE_TILE, { maxZoom: 19 }).addTo(map);
    fLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());

    // Deselect on map click
    map.on('click', () => setSelId(null));

    return () => {
      fLayer.current?.clearLayers();
      myMk.current?.remove();
      accCircle.current?.remove();
      map.remove();
      fLayer.current = null;
      myMk.current = null;
      accCircle.current = null;
      mapRef.current = null;
    };
  }, []);

  /* ── update my marker + accuracy circle ────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!myCoords) {
      myMk.current?.remove(); myMk.current = null;
      accCircle.current?.remove(); accCircle.current = null;
      return;
    }

    // Accuracy circle
    if (accuracy && accuracy < 500) {
      if (!accCircle.current) {
        accCircle.current = L.circle(myCoords, {
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
        accCircle.current.setLatLng(myCoords);
        accCircle.current.setRadius(accuracy);
      }
    }

    // My marker
    if (!myMk.current) {
      myMk.current = L.marker(myCoords, { icon: myIcon(), zIndexOffset: 1000, interactive: false }).addTo(map);
    } else {
      myMk.current.setLatLng(myCoords);
    }
  }, [myCoords, accuracy]);

  /* ── friend markers ────────────────────────────────── */

  useEffect(() => {
    const layer = fLayer.current;
    if (!layer) return;
    layer.clearLayers();
    friends.forEach((f) => {
      L.marker([f.latitude, f.longitude], { icon: friendIcon(f, f.user_id === selId), keyboard: false })
        .on('click', () => { focus(f); })
        .addTo(layer);
    });
  }, [friends, selId, focus]);

  /* ── initial framing ───────────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || framed.current) return;
    const pts: [number, number][] = [...friends.map((f) => [f.latitude, f.longitude] as [number, number]), ...(myCoords ? [myCoords] : [])];
    if (!pts.length) return;
    framed.current = true;
    if (pts.length === 1) { map.flyTo(pts[0], myCoords ? MY_LOCATION_ZOOM : 12, { duration: 1.2 }); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 14, animate: true });
  }, [myCoords, friends]);

  /* ── render ────────────────────────────────────────── */

  return (
    <AppLayout hideNav noPadding>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
        {/* CSS for markers + custom styles */}
        <style>{`
          @keyframes pulse-ring{0%{transform:scale(.8);opacity:1}100%{transform:scale(3);opacity:0}}
          @keyframes pulse-glow{0%,100%{box-shadow:0 0 0 0 hsl(217 91% 60%/.4)}50%{box-shadow:0 0 20px 8px hsl(217 91% 60%/.2)}}
          @keyframes bounce-in{0%{transform:scale(0) translateY(20px);opacity:0}60%{transform:scale(1.1) translateY(-4px);opacity:1}100%{transform:scale(1) translateY(0);opacity:1}}
          @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
          .friend-map-marker,.my-location-marker{background:transparent!important;border:none!important}
          .leaflet-container{height:100%;width:100%;background:#0a0a0a;font-family:inherit}
          .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
          
          /* Friend marker */
          .vfm{position:relative;display:flex;height:48px;width:48px;align-items:center;justify-content:center;overflow:visible;border-radius:9999px;border:3px solid hsl(var(--background));background:hsl(var(--card));box-shadow:0 8px 32px -8px rgba(0,0,0,.6);animation:bounce-in .5s cubic-bezier(.34,1.56,.64,1) both}
          .vfm.sel{border-color:hsl(var(--primary));box-shadow:0 0 0 4px hsl(var(--primary)/.3),0 8px 32px -8px rgba(0,0,0,.6);animation:float 2s ease-in-out infinite}
          .vfm-av{height:100%;width:100%;object-fit:cover;border-radius:9999px}
          .vfm-in{font-size:16px;font-weight:800;color:hsl(var(--foreground))}
          .vfm-status{position:absolute;top:0;right:0;height:12px;width:12px;border-radius:9999px;border:2.5px solid hsl(var(--background))}
          .vfm-status.online{background:#22c55e}
          .vfm-status.away{background:#6b7280}
          .vfm-arrow{position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:10px solid hsl(var(--card))}
          .vfm.sel .vfm-arrow{border-top-color:hsl(var(--primary))}
          .vfm-label{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;white-space:nowrap;font-size:11px;font-weight:700;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8),0 0 2px rgba(0,0,0,.6);pointer-events:none}
          
          /* My location */
          .vme{position:relative;display:flex;height:44px;width:44px;align-items:center;justify-content:center}
          .vme-ring{position:absolute;inset:-4px;border-radius:9999px;border:2px solid hsl(217 91% 60%/.3);animation:pulse-ring 2s ease-out infinite}
          .vme-p{position:absolute;inset:4px;border-radius:9999px;background:hsl(217 91% 60%/.15);animation:pulse-ring 2.5s ease-out infinite .5s}
          .vme-d{position:relative;z-index:1;height:18px;width:18px;border-radius:9999px;border:3px solid hsl(var(--background));background:hsl(217 91% 60%);box-shadow:0 0 12px 4px hsl(217 91% 60%/.35);animation:pulse-glow 2s ease-in-out infinite}
          
          /* Vignette overlay */
          .map-vignette{pointer-events:none;position:absolute;inset:0;z-index:500;background:radial-gradient(ellipse at center,transparent 50%,rgba(0,0,0,.3) 100%)}
          
          /* Scrollbar hide */
          .scrollbar-hide::-webkit-scrollbar{display:none}
          .scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}
        `}</style>

        {/* Map container */}
        <div ref={mapEl} className="absolute inset-0" />

        {/* Vignette overlay */}
        <div className="map-vignette" />

        {/* ── Top bar (frosted pill) ─────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-4 pt-[max(env(safe-area-inset-top),16px)]">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <motion.button
              onClick={() => navigate(-1)}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl"
            >
              <ChevronLeft className="h-5 w-5" />
            </motion.button>

            <div className="flex-1" />

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
              disabled={!myCoords}
              whileTap={{ scale: 0.9 }}
              className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-xl disabled:opacity-30"
            >
              <Navigation className="h-4.5 w-4.5" />
            </motion.button>
          </div>
        </div>

        {/* ── FAB: Share toggle ──────────────────────── */}
        <div className="pointer-events-none absolute right-4 z-[1000]" style={{ bottom: 'max(calc(env(safe-area-inset-bottom) + 180px), 196px)' }}>
          <motion.button
            onClick={toggleSharing}
            whileTap={{ scale: 0.9 }}
            className={cn(
              'pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full shadow-2xl transition-all',
              sharing
                ? 'bg-primary text-primary-foreground'
                : 'bg-black/50 text-white backdrop-blur-xl'
            )}
          >
            {sharing ? (
              <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
                <MapPin className="h-6 w-6" />
              </motion.div>
            ) : (
              <MapPin className="h-6 w-6 opacity-60" />
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

        {/* ── Bottom panel ─────────────────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] pb-[max(env(safe-area-inset-bottom),12px)]">
          <div className="mx-auto max-w-lg space-y-2 px-4">

            {/* Selected friend card */}
            <AnimatePresence>
              {sel && (
                <motion.div
                  initial={{ opacity: 0, y: 24, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.95 }}
                  transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                  className="pointer-events-auto rounded-3xl bg-black/60 p-4 shadow-2xl backdrop-blur-2xl border border-white/10"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10">
                      {sel.profile?.avatar_url ? (
                        <img src={sel.profile.avatar_url} alt={friendName(sel)} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-base font-bold text-white">{initial(friendName(sel))}</span>
                      )}
                      <span className={cn(
                        'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-black/60',
                        (Date.now() - new Date(sel.updated_at).getTime()) < 300_000 ? 'bg-green-400' : 'bg-gray-500'
                      )} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{friendName(sel)}</p>
                      <p className="truncate text-xs text-white/50">
                        {friendUsername(sel) ? `@${friendUsername(sel)}` : 'Sharing location'}
                        {' · '}
                        {timeSince(sel.updated_at) === 'now' ? '📍 Live' : `${timeSince(sel.updated_at)} ago`}
                      </p>
                      {myCoords && (
                        <p className="text-[11px] text-white/40 mt-0.5">
                          {distanceBetween(myCoords, [sel.latitude, sel.longitude]).toFixed(1)} mi away
                        </p>
                      )}
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={() => { const u = friendUsername(sel); if (u) navigate(`/u/${u}`); }}
                      disabled={!friendUsername(sel)}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-40"
                    >
                      Profile
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Horizontal friend strip (Snap style) */}
            {sortedFriends.length > 0 ? (
              <div className="pointer-events-auto -mx-1 flex gap-3 overflow-x-auto px-1 py-1 scrollbar-hide">
                {sortedFriends.map((f, i) => {
                  const isRecent = (Date.now() - new Date(f.updated_at).getTime()) < 300_000;
                  const isSelected = sel?.user_id === f.user_id;
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
                        isSelected ? 'bg-gradient-to-br from-primary to-primary/60' : isRecent ? 'bg-gradient-to-br from-green-400 to-emerald-600' : 'bg-white/20'
                      )}>
                        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-black/80">
                          {f.profile?.avatar_url ? (
                            <img src={f.profile.avatar_url} alt={friendName(f)} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="text-sm font-bold text-white">{initial(friendName(f))}</span>
                          )}
                        </div>
                        {isRecent && (
                          <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-black bg-green-400" />
                        )}
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
                {sharing ? 'Your live location is visible to friends' : 'Location sharing is off'}
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
