import { useState, useEffect, useCallback, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Navigation, MapPin, Layers, Ghost,
  RefreshCw, Plus, Radar,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotate';

import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useLocationContext } from '@/providers/LocationProvider';
import { navVisibility } from '@/lib/navVisibility';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { trackMapEvent } from '@/lib/vybemap/analytics';
import { isValidLatLng } from '@/lib/vybemap/geo';
import { activityMeta } from '@/lib/vybemap/activity';
import { LAYER_LABELS, type LiveFriend, type MapLayer, type TimeMachineMode } from '@/lib/vybemap/types';
import {
  useMapLayers, useFriendIds, useLiveFriends, useMapStories, useMapPosts,
  useMapClips, useMapMeetups, useMapHeatmap, useMapPlaces, useMapEventPins,
  useFriendRadar, useStartFindFriend, useCheckIn, useLogLocationAccess,
} from '@/hooks/vybemap/useVybeMap';
import { FindFriendOverlay } from '@/components/vybemap/FindFriendOverlay';
import { FriendCardSheet } from '@/components/vybemap/FriendCardSheet';
import { DiscoveryDrawer } from '@/components/vybemap/DiscoveryDrawer';

const DEFAULT_CENTER: [number, number] = [39.8283, -98.5795];
const MAP_TILES: Record<string, { url: string; label: string; icon: string }> = {
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', label: 'Dark', icon: '🌑' },
  streets: { url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', label: 'Streets', icon: '🗺️' },
  satellite: { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', label: 'Satellite', icon: '🛰️' },
};

class MapErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(e: Error, i: ErrorInfo) { console.error('[VybeMap]', e, i); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 bg-background">
          <MapPin className="h-12 w-12 text-muted-foreground" />
          <p className="text-lg font-bold">VybeMap couldn&apos;t load</p>
          <button type="button" onClick={() => this.setState({ hasError: false })} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <RefreshCw className="inline h-4 w-4 mr-2" />Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function VybeMapInner() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const { coords: myCoords, sharing, setSharing } = useLocationContext();

  const { layers, toggleLayer } = useMapLayers();
  const { data: friendIds = [] } = useFriendIds(profileId ?? profile?.id);
  const { data: friends = [] } = useLiveFriends(friendIds, profileId);
  const { data: stories = [] } = useMapStories(layers.stories);
  const { data: posts = [] } = useMapPosts(layers.posts);
  const { data: clips = [] } = useMapClips(layers.clips);
  const { data: meetups = [] } = useMapMeetups(layers.meetups);
  const { data: heatmap = [] } = useMapHeatmap(layers.heatmap);
  const { data: places = [] } = useMapPlaces(layers.trending || layers.hotspots);
  const { data: eventPins = [] } = useMapEventPins(layers.events);

  const radar = useFriendRadar(friends, myCoords);
  const startFind = useStartFindFriend();
  const checkIn = useCheckIn();
  const logAccess = useLogLocationAccess();

  const [selId, setSelId] = useState<string | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [findMode, setFindMode] = useState<{ friend: LiveFriend; ar: boolean } | null>(null);
  const [timeMode, setTimeMode] = useState<TimeMachineMode>('now');
  const [teleportQuery, setTeleportQuery] = useState('');
  const [mapStyle, setMapStyle] = useState('dark');

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const heatLayerRef = useRef<L.LayerGroup | null>(null);
  const friendMarkers = useRef<Map<string, L.Marker>>(new Map());

  const safeMyCoords = useMemo(
    () => (myCoords && isValidLatLng(myCoords[0], myCoords[1]) ? myCoords : null),
    [myCoords],
  );
  const sel = useMemo(() => friends.find((f) => f.user_id === selId) || null, [friends, selId]);

  useEffect(() => {
    trackMapEvent('map_open');
    navVisibility.setImmersiveView(true);
    document.body.classList.add('hide-bottom-nav');
    return () => {
      navVisibility.setImmersiveView(false);
      document.body.classList.remove('hide-bottom-nav');
    };
  }, []);

  useEffect(() => {
    const el = mapEl.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { zoomControl: false, attributionControl: false, rotate: true, bearing: 0 } as L.MapOptions).setView(
      safeMyCoords || DEFAULT_CENTER,
      safeMyCoords ? 14 : 4,
    );
    tileRef.current = L.tileLayer(MAP_TILES[mapStyle].url, { maxZoom: 19 }).addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    heatLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    map.on('click', () => setSelId(null));
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = markersRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    friendMarkers.current.clear();

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
        const m = L.marker([lat, lng], { icon }).addTo(layer);
        m.on('click', () => {
          setSelId(f.user_id);
          void logAccess(f.user_id, 'friend_tap');
          trackMapEvent('friend_tap', { userId: f.user_id });
        });
        friendMarkers.current.set(f.user_id, m);
      });
    }

    if (layers.stories) {
      stories.forEach((s) => {
        L.circleMarker([s.latitude, s.longitude], { radius: 8, color: '#ec4899', fillColor: '#f472b6', fillOpacity: 0.9, weight: 2 }).addTo(layer);
      });
    }
    if (layers.posts) {
      posts.forEach((p) => {
        L.circleMarker([p.latitude, p.longitude], { radius: 6, color: '#8b5cf6', fillColor: '#a78bfa', fillOpacity: 0.85, weight: 2 }).addTo(layer);
      });
    }
    if (layers.clips) {
      clips.forEach((c) => {
        L.circleMarker([c.latitude, c.longitude], { radius: 7, color: '#06b6d4', fillColor: '#22d3ee', fillOpacity: 0.85, weight: 2 }).addTo(layer);
      });
    }
    if (layers.events) {
      eventPins.forEach((e) => {
        L.circleMarker([e.latitude, e.longitude], { radius: 9, color: '#f59e0b', fillColor: '#fbbf24', fillOpacity: 0.9, weight: 2 }).addTo(layer);
      });
    }
    if (layers.meetups) {
      meetups.forEach((m) => {
        L.circleMarker([m.dest_latitude, m.dest_longitude], { radius: 10, color: '#10b981', fillColor: '#34d399', fillOpacity: 0.9, weight: 3 }).addTo(layer);
      });
    }
    if (layers.trending || layers.hotspots) {
      places.slice(0, 30).forEach((p) => {
        L.circleMarker([p.latitude, p.longitude], { radius: 5 + Math.min(p.check_in_count, 20) / 4, color: '#f97316', fillColor: '#fb923c', fillOpacity: 0.7, weight: 1 }).addTo(layer);
      });
    }
  }, [friends, stories, posts, clips, eventPins, meetups, places, layers, logAccess]);

  useEffect(() => {
    const hLayer = heatLayerRef.current;
    if (!hLayer) return;
    hLayer.clearLayers();
    if (!layers.heatmap) return;
    heatmap.forEach((cell) => {
      const r = 200 + cell.intensity * 400;
      L.circle([cell.cell_latitude, cell.cell_longitude], {
        radius: r,
        color: 'transparent',
        fillColor: '#a855f7',
        fillOpacity: Math.min(0.45, cell.intensity / 100),
        weight: 0,
      }).addTo(hLayer);
    });
  }, [heatmap, layers.heatmap]);

  useEffect(() => {
    if (!safeMyCoords || !mapRef.current) return;
    L.circleMarker(safeMyCoords, { radius: 10, color: '#3b82f6', fillColor: '#60a5fa', fillOpacity: 1, weight: 3 }).addTo(markersRef.current!);
  }, [safeMyCoords]);

  const recenter = () => {
    if (!safeMyCoords) return;
    mapRef.current?.flyTo(safeMyCoords, 15, { duration: 0.8 });
    triggerHaptic('light');
  };

  const toggleSharing = () => {
    setSharing(!sharing);
    triggerHaptic('medium');
    toast.success(!sharing ? 'You\'re live on VybeMap' : 'Ghost Mode — you\'re hidden');
    setGhostOpen(false);
  };

  const handleTeleport = async () => {
    if (!teleportQuery.trim()) return;
    trackMapEvent('teleport', { q: teleportQuery });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(teleportQuery)}`);
      const data = await res.json();
      if (data?.[0]) {
        mapRef.current?.flyTo([parseFloat(data[0].lat), parseFloat(data[0].lon)], 12, { duration: 1.5 });
        toast.success(`Teleported to ${data[0].display_name}`);
      }
    } catch {
      toast.error('Could not find that place');
    }
  };

  const handleCheckIn = () => {
    if (!safeMyCoords) return;
    checkIn.mutate({ latitude: safeMyCoords[0], longitude: safeMyCoords[1], message: 'Checked in on VybeMap' }, {
      onSuccess: () => { toast.success('Checked in!'); trackMapEvent('check_in'); },
    });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-black vybe-map-shell">
      <style>{`
        .vybe-live-marker{position:relative;width:44px;height:44px;border-radius:9999px;box-shadow:0 0 0 3px var(--ring),0 4px 20px rgba(0,0,0,.4)}
        .vybe-live-avatar{width:100%;height:100%;border-radius:9999px;object-fit:cover;border:2px solid #fff}
        .vybe-live-emoji{position:absolute;bottom:-4px;right:-4px;font-size:14px;background:#000;border-radius:9999px;padding:2px}
        .vybe-map-glass{background:rgba(0,0,0,.55);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.08)}
      `}</style>

      <div ref={mapEl} className="absolute inset-0" />

      {/* Top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] px-3 pt-[max(var(--sat,0px),8px)]">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate(-1)} className="pointer-events-auto vybe-map-glass h-10 w-10 rounded-full flex items-center justify-center text-white">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 pointer-events-auto flex gap-2">
            <input
              value={teleportQuery}
              onChange={(e) => setTeleportQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleTeleport()}
              placeholder="Teleport to city…"
              className="flex-1 h-10 rounded-full vybe-map-glass px-4 text-sm text-white placeholder:text-white/40 outline-none"
            />
            <button type="button" onClick={() => void handleTeleport()} className="vybe-map-glass h-10 px-3 rounded-full text-xs font-bold text-white">Go</button>
          </div>
          <button type="button" onClick={() => setLayersOpen((v) => !v)} className="pointer-events-auto vybe-map-glass h-10 w-10 rounded-full flex items-center justify-center text-white">
            <Layers className="h-4 w-4" />
          </button>
        </div>

        {/* Time machine */}
        <div className="pointer-events-auto flex gap-1.5 mt-2 overflow-x-auto scrollbar-hide">
          {(['now', '1h', '6h', 'yesterday', 'week'] as TimeMachineMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => { setTimeMode(m); trackMapEvent('time_machine', { mode: m }); }}
              className={cn('shrink-0 rounded-full px-3 py-1 text-[10px] font-bold', timeMode === m ? 'bg-primary text-primary-foreground' : 'vybe-map-glass text-white/70')}
            >
              {m === 'now' ? 'Now' : m === '1h' ? '1h ago' : m === '6h' ? '6h ago' : m === 'yesterday' ? 'Yesterday' : 'This week'}
            </button>
          ))}
        </div>

        {radar.label && (
          <div className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full vybe-map-glass px-3 py-1.5 text-xs text-white">
            <Radar className="h-3.5 w-3.5 text-green-400" /> {radar.label}
          </div>
        )}
      </div>

      {/* Layer panel */}
      <AnimatePresence>
        {layersOpen && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            className="pointer-events-auto absolute right-3 top-28 z-[1001] w-48 rounded-2xl vybe-map-glass p-2 space-y-1">
            {(Object.keys(LAYER_LABELS) as MapLayer[]).map((key) => (
              <button key={key} type="button" onClick={() => { toggleLayer(key); trackMapEvent('layer_toggle', { layer: key }); }}
                className={cn('w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold', layers[key] ? 'bg-primary/25 text-primary' : 'text-white/60')}>
                {LAYER_LABELS[key]}
                <span className={cn('h-2 w-2 rounded-full', layers[key] ? 'bg-primary' : 'bg-white/20')} />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right FABs */}
      <div className="pointer-events-none absolute right-3 z-[1000] flex flex-col gap-2" style={{ top: '45%' }}>
        <button type="button" onClick={recenter} className="pointer-events-auto vybe-map-glass h-11 w-11 rounded-full flex items-center justify-center text-white"><Navigation className="h-4 w-4" /></button>
        <button type="button" onClick={() => setGhostOpen(true)} className={cn('pointer-events-auto h-11 w-11 rounded-full flex items-center justify-center', sharing ? 'bg-primary text-primary-foreground' : 'vybe-map-glass text-white')}>
          {sharing ? <MapPin className="h-4 w-4" /> : <Ghost className="h-4 w-4" />}
        </button>
        <button type="button" onClick={handleCheckIn} className="pointer-events-auto vybe-map-glass h-11 w-11 rounded-full flex items-center justify-center text-white"><Plus className="h-4 w-4" /></button>
      </div>

      {/* Ghost sheet */}
      <AnimatePresence>
        {ghostOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[2000] bg-black/50" onClick={() => setGhostOpen(false)} />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              className="fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl bg-black/95 border-t border-white/10 p-6 pb-safe">
              <h3 className="text-lg font-bold text-white mb-2">Privacy & Ghost Mode</h3>
              <p className="text-sm text-white/50 mb-4">Precise · Approximate · Friends · Best friends · Group · Temporary · Scheduled · Ghost</p>
              <button type="button" onClick={toggleSharing} className="w-full py-3 rounded-xl bg-primary font-bold text-primary-foreground">
                {sharing ? 'Enable Ghost Mode' : 'Share live location'}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sel && safeMyCoords && (
          <FriendCardSheet
            friend={sel}
            myCoords={safeMyCoords}
            onClose={() => setSelId(null)}
            onMessage={() => navigate('/messages')}
            onNavigate={() => {
              const lat = sel.displayLat ?? sel.latitude;
              const lng = sel.displayLng ?? sel.longitude;
              window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
            }}
            onFind={() => {
              void startFind.mutateAsync(sel.user_id);
              setFindMode({ friend: sel, ar: false });
              trackMapEvent('find_friend_start');
            }}
            onProfile={() => { const u = sel.profile?.username; if (u) navigate(`/u/${u}`); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {findMode && safeMyCoords && (
          <FindFriendOverlay
            friend={findMode.friend}
            myCoords={safeMyCoords}
            arMode={findMode.ar}
            onClose={() => setFindMode(null)}
            onFound={() => trackMapEvent('find_friend_found')}
          />
        )}
      </AnimatePresence>

      <DiscoveryDrawer
        open={discoveryOpen}
        onToggle={() => { setDiscoveryOpen((v) => !v); trackMapEvent('discovery_open'); }}
        friends={friends}
        stories={stories}
        clips={clips}
        meetups={meetups}
        places={places}
        radarLabel={radar.label}
        onFriendTap={(f) => { setSelId(f.user_id); mapRef.current?.flyTo([f.displayLat ?? f.latitude, f.displayLng ?? f.longitude], 16); }}
        onMeetupTap={(m) => mapRef.current?.flyTo([m.dest_latitude, m.dest_longitude], 15)}
        onPlaceTap={(p) => mapRef.current?.flyTo([p.latitude, p.longitude], 15)}
      />
    </div>
  );
}

export default function VybeMap() {
  return (
    <MapErrorBoundary>
      <VybeMapInner />
    </MapErrorBoundary>
  );
}
