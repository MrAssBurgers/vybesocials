import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, ChevronLeft, ToggleLeft, ToggleRight, Locate, Minus, Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
const FRIEND_FOCUS_ZOOM = 15;
const MY_LOCATION_ZOOM = 15;
const LOCATION_SHARE_HOURS = 8;
const SATELLITE_TILE =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/* ── helpers ─────────────────────────────────────────── */

function isBackendMissing(error: any) {
  return (
    error?.code === 'PGRST205' ||
    error?.status === 404 ||
    /user_locations/i.test(String(error?.message || ''))
  );
}

function isActive(loc?: Partial<LocationRecord> | null) {
  if (!loc?.sharing_enabled) return false;
  if (!loc.expires_at) return true;
  return new Date(loc.expires_at).getTime() > Date.now();
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

function friendIcon(f: LocationRecord, selected: boolean) {
  const name = esc(friendName(f));
  const avatar = f.profile?.avatar_url ? esc(f.profile.avatar_url) : null;
  return L.divIcon({
    className: 'friend-map-marker',
    iconSize: [48, 56],
    iconAnchor: [24, 52],
    html: `<div class="vfm ${selected ? 'sel' : ''}" aria-label="${name}">
      ${avatar ? `<img src="${avatar}" alt="${name}" class="vfm-av"/>` : `<span class="vfm-in">${initial(name)}</span>`}
      <span class="vfm-pin"></span>
    </div>`,
  });
}

function myIcon() {
  return L.divIcon({
    className: 'my-location-marker',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    html: `<div class="vme"><span class="vme-p"></span><span class="vme-d"></span></div>`,
  });
}

/* ── data hooks ──────────────────────────────────────── */

function useFriendIds(profileId?: string) {
  return useQuery({
    queryKey: ['friend-map-ids', profileId],
    enabled: !!profileId,
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
    queryFn: async (): Promise<{ rows: LocationRecord[]; missing: boolean }> => {
      if (!friendIds.length) return { rows: [], missing: false };
      const { data, error } = await (supabase as any)
        .from('user_locations')
        .select('id, user_id, latitude, longitude, accuracy, label, updated_at, expires_at, sharing_enabled, profile:profiles(username, display_name, avatar_url)')
        .in('user_id', friendIds)
        .eq('sharing_enabled', true);
      if (error) {
        if (isBackendMissing(error)) return { rows: [], missing: true };
        throw error;
      }
      return { rows: ((data || []) as LocationRecord[]).filter(isActive), missing: false };
    },
    refetchInterval: 30000,
  });
}

function useMyLocation() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ['my-location', profile?.id],
    enabled: !!profile?.id,
    queryFn: async (): Promise<{ row: LocationRecord | null; missing: boolean }> => {
      if (!profile?.id) return { row: null, missing: false };
      const { data, error } = await (supabase as any)
        .from('user_locations')
        .select('id, user_id, latitude, longitude, accuracy, label, updated_at, expires_at, sharing_enabled')
        .eq('user_id', profile.id)
        .maybeSingle();
      if (error) {
        if (isBackendMissing(error)) return { row: null, missing: true };
        throw error;
      }
      return { row: data as LocationRecord | null, missing: false };
    },
  });
}

/* ── component ───────────────────────────────────────── */

export default function FriendMap() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: friendIds = [], isLoading: idsLoading } = useFriendIds(profile?.id);
  const { data: flState } = useFriendLocations(friendIds);
  const { data: mlState } = useMyLocation();

  const friends = useMemo(() => flState?.rows || [], [flState]);
  const myLoc = mlState?.row || null;
  const backendMissing = !!flState?.missing || !!mlState?.missing;
  const sharing = isActive(myLoc);

  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const fLayer = useRef<L.LayerGroup | null>(null);
  const myMk = useRef<L.Marker | null>(null);
  const framed = useRef(false);

  const [myCoords, setMyCoords] = useState<[number, number] | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const sel = useMemo(() => friends.find((f) => f.user_id === selId) || null, [friends, selId]);

  /* ── mutations ─────────────────────────────────────── */

  const toggle = useMutation({
    mutationFn: async (enable: boolean) => {
      if (!profile?.id) throw new Error('Not logged in');
      if (enable) {
        const pos = await new Promise<GeolocationPosition>((ok, fail) =>
          navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 10000 })
        );
        const lat = Number(pos.coords.latitude.toFixed(2));
        const lng = Number(pos.coords.longitude.toFixed(2));
        const expires = new Date(Date.now() + LOCATION_SHARE_HOURS * 3600000).toISOString();
        const { error } = await (supabase as any)
          .from('user_locations')
          .upsert({ user_id: profile.id, latitude: lat, longitude: lng, accuracy: pos.coords.accuracy, sharing_enabled: true, expires_at: expires }, { onConflict: 'user_id' });
        if (error) throw error;
        return [lat, lng] as [number, number];
      }
      const { error } = await (supabase as any).from('user_locations').update({ sharing_enabled: false }).eq('user_id', profile.id);
      if (error) throw error;
      return null;
    },
    onSuccess: (coords) => {
      setMyCoords(coords);
      if (coords) mapRef.current?.flyTo(coords, MY_LOCATION_ZOOM, { duration: 0.8 });
      qc.invalidateQueries({ queryKey: ['my-location'] });
      qc.invalidateQueries({ queryKey: ['friend-locations'] });
      triggerHaptic('medium');
      toast.success(coords ? 'Location sharing on 📍' : 'Location sharing off');
    },
    onError: (e: any) => {
      toast.error(isBackendMissing(e) ? 'Friend Map backend is still being set up.' : e?.message || 'Failed');
    },
  });

  const focus = useCallback((f: LocationRecord) => {
    setSelId(f.user_id);
    mapRef.current?.flyTo([f.latitude, f.longitude], FRIEND_FOCUS_ZOOM, { duration: 0.8 });
    triggerHaptic('light');
  }, []);

  const recenter = useCallback(() => {
    if (!myCoords) return;
    mapRef.current?.flyTo(myCoords, MY_LOCATION_ZOOM, { duration: 0.8 });
    triggerHaptic('light');
  }, [myCoords]);

  /* ── leaflet lifecycle ─────────────────────────────── */

  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: false, minZoom: 2, maxZoom: 19, worldCopyJump: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer(SATELLITE_TILE, { maxZoom: 19 }).addTo(map);
    fLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    requestAnimationFrame(() => map.invalidateSize());
    return () => { fLayer.current?.clearLayers(); myMk.current?.remove(); map.remove(); fLayer.current = null; myMk.current = null; mapRef.current = null; };
  }, []);

  useEffect(() => { setMyCoords(myLoc && isActive(myLoc) ? [myLoc.latitude, myLoc.longitude] : null); }, [myLoc]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!myCoords) { myMk.current?.remove(); myMk.current = null; return; }
    if (!myMk.current) { myMk.current = L.marker(myCoords, { icon: myIcon(), zIndexOffset: 1000, interactive: false }).addTo(map); return; }
    myMk.current.setLatLng(myCoords);
  }, [myCoords]);

  useEffect(() => {
    const layer = fLayer.current;
    if (!layer) return;
    layer.clearLayers();
    friends.forEach((f) => {
      L.marker([f.latitude, f.longitude], { icon: friendIcon(f, f.user_id === selId), keyboard: false })
        .on('click', () => focus(f))
        .addTo(layer);
    });
  }, [friends, selId, focus]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || framed.current) return;
    const pts: [number, number][] = [...friends.map((f) => [f.latitude, f.longitude] as [number, number]), ...(myCoords ? [myCoords] : [])];
    if (!pts.length) return;
    framed.current = true;
    if (pts.length === 1) { map.setView(pts[0], myCoords ? MY_LOCATION_ZOOM : 10); return; }
    map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 12 });
  }, [myCoords, friends]);

  /* ── derived ui strings ────────────────────────────── */

  const summary = backendMissing
    ? 'Location sharing is still being set up'
    : idsLoading
      ? 'Loading…'
      : friends.length > 0
        ? `${friends.length} friend${friends.length === 1 ? '' : 's'} sharing`
        : 'No friends sharing right now';

  const expiryLabel = sharing && myLoc?.expires_at
    ? `Ends ${formatDistanceToNow(new Date(myLoc.expires_at), { addSuffix: true })}`
    : 'Private';

  /* ── render ────────────────────────────────────────── */

  return (
    <AppLayout hideNav noPadding>
      <div className="relative h-[100dvh] w-full overflow-hidden bg-background">
        {/* CSS for markers */}
        <style>{`
          @keyframes pulse-ring{0%{transform:scale(.9);opacity:.9}100%{transform:scale(2.5);opacity:0}}
          .friend-map-marker,.my-location-marker{background:transparent!important;border:none!important}
          .leaflet-container{height:100%;width:100%;background:hsl(var(--background));font-family:inherit}
          .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
          .vfm{position:relative;display:flex;height:48px;width:48px;align-items:center;justify-content:center;overflow:hidden;border-radius:9999px;border:2px solid hsl(var(--background));background:hsl(var(--card)/.92);box-shadow:0 14px 30px -14px hsl(var(--foreground)/.55);backdrop-filter:blur(12px)}
          .vfm.sel{box-shadow:0 0 0 4px hsl(var(--primary)/.22),0 14px 30px -14px hsl(var(--foreground)/.55);border-color:hsl(var(--primary))}
          .vfm-av{height:100%;width:100%;object-fit:cover}
          .vfm-in{font-size:15px;font-weight:700;color:hsl(var(--foreground))}
          .vfm-pin{position:absolute;bottom:-3px;left:50%;height:10px;width:10px;transform:translateX(-50%);border-radius:9999px;border:2px solid hsl(var(--background));background:hsl(var(--primary))}
          .vme{position:relative;display:flex;height:28px;width:28px;align-items:center;justify-content:center}
          .vme-p{position:absolute;inset:0;border-radius:9999px;background:hsl(var(--primary)/.3);animation:pulse-ring 1.8s ease-out infinite}
          .vme-d{position:relative;z-index:1;height:14px;width:14px;border-radius:9999px;border:3px solid hsl(var(--background));background:hsl(var(--primary));box-shadow:0 0 0 5px hsl(var(--primary)/.16)}
        `}</style>

        {/* Map container */}
        <div ref={mapEl} className="absolute inset-0" />

        {/* ── Top bar ──────────────────────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-3 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="mx-auto flex max-w-xl items-start gap-2">
            <button onClick={() => navigate(-1)} className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/75 text-foreground shadow-xl backdrop-blur-2xl">
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="pointer-events-auto min-w-0 flex-1 rounded-[26px] border border-border/50 bg-background/65 px-3.5 py-2.5 shadow-xl backdrop-blur-2xl">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold text-foreground">Friend Map</h1>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{summary}</p>
                </div>
                <span className="shrink-0 rounded-full border border-border/40 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{expiryLabel}</span>
              </div>
            </div>

            <button onClick={recenter} disabled={!myCoords} className="pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/75 text-foreground shadow-xl backdrop-blur-2xl disabled:opacity-40">
              <Locate className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Zoom controls ────────────────────────────── */}
        <div className="pointer-events-none absolute right-3 top-[max(calc(env(safe-area-inset-top)+80px),92px)] z-[1000] flex flex-col gap-2">
          <button onClick={() => { mapRef.current?.zoomIn(); triggerHaptic('light'); }} className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-[18px] border border-border/50 bg-background/75 text-foreground shadow-xl backdrop-blur-2xl">
            <Plus className="h-4 w-4" />
          </button>
          <button onClick={() => { mapRef.current?.zoomOut(); triggerHaptic('light'); }} className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-[18px] border border-border/50 bg-background/75 text-foreground shadow-xl backdrop-blur-2xl">
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {/* ── Bottom panel ─────────────────────────────── */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
          <div className="mx-auto max-w-xl space-y-2.5">
            {/* selected friend card */}
            <AnimatePresence>
              {sel && (
                <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 18 }} className="pointer-events-auto rounded-[28px] border border-border/50 bg-background/80 p-4 shadow-2xl backdrop-blur-2xl">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15">
                      {sel.profile?.avatar_url ? (
                        <img src={sel.profile.avatar_url} alt={friendName(sel)} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="text-sm font-bold text-foreground">{initial(friendName(sel))}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{friendName(sel)}</p>
                      <p className="truncate text-xs text-muted-foreground">{friendUsername(sel) ? `@${friendUsername(sel)}` : 'Shared location'}</p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Updated {formatDistanceToNow(new Date(sel.updated_at), { addSuffix: true })}
                      </p>
                    </div>
                    <button onClick={() => setSelId(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button onClick={() => focus(sel)} className="rounded-2xl border border-border/60 bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">Center</button>
                    <button onClick={() => { const u = friendUsername(sel); if (u) navigate(`/u/${u}`); }} disabled={!friendUsername(sel)} className="rounded-2xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">Profile</button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* sharing toggle */}
            <motion.button
              onClick={() => toggle.mutate(!sharing)}
              disabled={toggle.isPending}
              whileTap={{ scale: 0.985 }}
              className={cn(
                'pointer-events-auto w-full rounded-[28px] border p-3.5 text-left shadow-2xl backdrop-blur-2xl transition-all',
                sharing ? 'border-primary/40 bg-primary/10' : 'border-border/50 bg-background/75'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]', sharing ? 'bg-primary/15 text-primary' : 'bg-muted/60 text-muted-foreground')}>
                  <Shield className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{sharing ? 'Sharing On' : 'Share My Location'}</p>
                  <p className="text-[11px] text-muted-foreground">{sharing ? `Friends can find you for ${LOCATION_SHARE_HOURS}h` : 'Rounded for privacy · auto-expires'}</p>
                </div>
                {sharing ? <ToggleRight className="h-7 w-7 shrink-0 text-primary" /> : <ToggleLeft className="h-7 w-7 shrink-0 text-muted-foreground" />}
              </div>
            </motion.button>

            {/* friends chips or empty state */}
            {backendMissing ? (
              <div className="pointer-events-auto rounded-[24px] border border-border/50 bg-background/75 px-4 py-3 shadow-xl backdrop-blur-2xl">
                <p className="text-sm font-medium text-foreground">Backend still being set up</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">The screen is ready — location storage needs to be added.</p>
              </div>
            ) : friends.length > 0 ? (
              <div className="pointer-events-auto -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
                {friends.map((f) => (
                  <motion.button key={f.user_id} onClick={() => focus(f)} whileTap={{ scale: 0.97 }} className={cn('shrink-0 rounded-full border px-3 py-2 shadow-lg backdrop-blur-xl transition-all', sel?.user_id === f.user_id ? 'border-primary/50 bg-primary/15' : 'border-border/50 bg-background/70')}>
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-primary/15">
                        {f.profile?.avatar_url ? <img src={f.profile.avatar_url} alt={friendName(f)} className="h-full w-full object-cover" loading="lazy" /> : <span className="text-[10px] font-bold text-foreground">{initial(friendName(f))}</span>}
                      </div>
                      <span className="max-w-[100px] truncate whitespace-nowrap text-xs font-medium text-foreground">{friendName(f)}</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            ) : (
              <div className="pointer-events-auto rounded-[24px] border border-border/50 bg-background/75 px-4 py-3 shadow-xl backdrop-blur-2xl">
                <p className="text-sm font-medium text-foreground">Nobody sharing right now</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">When friends turn on sharing, they'll appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
