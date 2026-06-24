import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, Component, memo, type ReactNode, type ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type L from 'leaflet';

import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useLocationContext } from '@/providers/LocationProvider';
import { navVisibility } from '@/lib/navVisibility';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { trackMapEvent } from '@/lib/vybemap/analytics';
import { isValidLatLng } from '@/lib/vybemap/geo';
import { type LiveFriend, type MapPlace, type MapMeetup } from '@/lib/vybemap/types';
import {
  useMapLayers, useFriendIds, useLiveFriends, useMapStories, useMapPosts,
  useMapClips, useMapMeetups, useMapHeatmap, useMapPlaces, useMapEventPins,
  useFriendRadar, useStartFindFriend, useCheckIn, useCreateMapSpot, useLogLocationAccess,
  useFriendCheckIns, useCreateMeetup, useJoinMeetup, useLeaveMeetup, useMyMeetupMemberships,
  useGroupMaps, useCreateGroupMap, useGroupMemberIds,
} from '@/hooks/vybemap/useVybeMap';
import { FindFriendOverlay } from '@/components/vybemap/FindFriendOverlay';
import { FriendCardSheet } from '@/components/vybemap/FriendCardSheet';
import { DiscoveryDrawer } from '@/components/vybemap/DiscoveryDrawer';
import { SpotDropSheet } from '@/components/vybemap/SpotDropSheet';
import { PlacePageSheet } from '@/components/vybemap/PlacePageSheet';
import { MeetupSheet, MeetupCreateSheet } from '@/components/vybemap/MeetupSheet';
import { GroupMapSheet } from '@/components/vybemap/GroupMapSheet';
import { MapRouteBar } from '@/components/vybemap/MapRouteBar';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { hasMapbox } from '@/lib/vybemap/mapbox/config';
import type { MapViewMode } from '@/lib/vybemap/mapbox/config';
import { fetchMapboxRoute } from '@/lib/vybemap/mapbox/directions';
import { externalDirectionsUrl } from '@/lib/vybemap/mapNavigation';
import { isHeadingTowardYou } from '@/lib/vybemap/headingToward';
import { sendMapWave } from '@/lib/vybemap/mapSocial';
import type { MapGroupMap } from '@/lib/vybemap/types';
import { VybeMapboxCanvas, useVybeMapFlyTo } from '@/components/vybemap/map/VybeMapboxCanvas';
import { GhostModeSheet } from '@/components/vybemap/hud/GhostModeSheet';
import { MapSnapTopBar } from '@/components/vybemap/hud/MapSnapTopBar';
import { MapSettingsSheet } from '@/components/vybemap/hud/MapSettingsSheet';
import { MapFloatingActions } from '@/components/vybemap/hud/MapFloatingActions';

const VybeMapLeafletFallback = lazy(() =>
  import('@/components/vybemap/map/VybeMapLeafletFallback').then((m) => ({
    default: m.VybeMapLeafletFallback,
  })),
);

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
  const useMapbox = hasMapbox();

  const { layers, toggleLayer } = useMapLayers();
  const { data: friendIds = [] } = useFriendIds(profileId ?? profile?.id);
  const { data: friends = [] } = useLiveFriends(friendIds);
  const { data: friendCheckIns = [] } = useFriendCheckIns(friendIds);
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
  const createSpot = useCreateMapSpot();
  const createMeetup = useCreateMeetup();
  const joinMeetup = useJoinMeetup();
  const leaveMeetup = useLeaveMeetup();
  const { data: meetupMemberships } = useMyMeetupMemberships(profileId ?? profile?.id);
  const effectiveId = profileId ?? profile?.id;
  const { data: groupMaps = [] } = useGroupMaps(effectiveId);
  const createGroupMap = useCreateGroupMap();
  const logAccess = useLogLocationAccess();
  const { setMap, flyTo } = useVybeMapFlyTo();

  const [selId, setSelId] = useState<string | null>(null);
  const [selPlace, setSelPlace] = useState<MapPlace | null>(null);
  const [selMeetup, setSelMeetup] = useState<MapMeetup | null>(null);
  const [meetupCreateOpen, setMeetupCreateOpen] = useState(false);
  const [spotDropOpen, setSpotDropOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [findMode, setFindMode] = useState<{ friend: LiveFriend; ar: boolean } | null>(null);
  const [mapViewMode, setMapViewMode] = useState<MapViewMode>('2d');
  const [squadsOpen, setSquadsOpen] = useState(false);
  const [activeSquad, setActiveSquad] = useState<MapGroupMap | null>(null);
  const { data: squadMemberIds = [] } = useGroupMemberIds(activeSquad?.id);
  const [route, setRoute] = useState<{
    label: string;
    dest: [number, number];
    geometry: GeoJSON.LineString;
    durationMinutes: number;
    distanceMiles: number;
    externalUrl: string;
  } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const { data: routeDestIntel } = useLocationIntel({
    latitude: route?.dest[0] ?? 0,
    longitude: route?.dest[1] ?? 0,
    placeName: route?.label.replace(/^Route to /, ''),
    enabled: !!route,
  });

  const mapEl = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeMyCoords = useMemo(
    () => (myCoords && isValidLatLng(myCoords[0], myCoords[1]) ? myCoords : null),
    [myCoords],
  );
  const sel = useMemo(() => friends.find((f) => f.user_id === selId) || null, [friends, selId]);
  const squadSet = useMemo(
    () => (layers.groups && activeSquad ? new Set(squadMemberIds) : undefined),
    [layers.groups, activeSquad, squadMemberIds],
  );

  const startLiveRoute = useCallback(async (
    label: string,
    dest: [number, number],
    options?: { dismissSheets?: boolean },
  ) => {
    const externalUrl = externalDirectionsUrl(dest[0], dest[1]);
    if (!safeMyCoords) {
      window.open(externalUrl, '_blank');
      return;
    }
    if (options?.dismissSheets !== false) {
      setSelId(null);
      setSelPlace(null);
      setSelMeetup(null);
      setDiscoveryOpen(false);
      setSettingsOpen(false);
    }
    setRouteLoading(true);
    try {
      const result = await fetchMapboxRoute(safeMyCoords, dest);
      if (result) {
        setRoute({
          label,
          dest,
          geometry: result.geometry,
          durationMinutes: result.durationMinutes,
          distanceMiles: result.distanceMiles,
          externalUrl,
        });
        triggerHaptic('light');
      } else {
        window.open(externalUrl, '_blank');
        toast.message('Opened directions in Maps');
      }
    } catch {
      window.open(externalUrl, '_blank');
      toast.error('Could not load live route — opened Maps instead');
    } finally {
      setRouteLoading(false);
    }
  }, [safeMyCoords]);

  const onFriendTap = useCallback((f: LiveFriend) => {
    setSelId(f.user_id);
    void logAccess(f.user_id, 'friend_tap');
    trackMapEvent('friend_tap', { userId: f.user_id });
  }, [logAccess]);

  const onPlaceTap = useCallback((p: MapPlace) => {
    setSelPlace(p);
    trackMapEvent('spot_tap', { placeId: p.id });
  }, []);

  const mapProps = useMemo(() => ({
    center: safeMyCoords,
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
  }), [safeMyCoords, layers, friends, stories, posts, clips, meetups, places, eventPins, heatmap, onFriendTap, onPlaceTap]);

  useEffect(() => {
    trackMapEvent('map_open');
    navVisibility.setImmersiveView(true);
    document.body.classList.add('hide-bottom-nav');
    return () => {
      navVisibility.setImmersiveView(false);
      document.body.classList.remove('hide-bottom-nav');
    };
  }, []);

  useEffect(() => () => {
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
  }, []);

  const mapFlyTo = useCallback((lat: number, lng: number, zoom = 15) => {
    if (useMapbox) flyTo(lat, lng, zoom);
    else import('@/components/vybemap/map/VybeMapLeafletFallback').then(({ leafletFlyTo }) => {
      leafletFlyTo(leafletMapRef.current, lat, lng, zoom);
    });
  }, [useMapbox, flyTo]);

  const handleMeetupTap = useCallback((m: MapMeetup) => {
    setSelMeetup(m);
    mapFlyTo(m.dest_latitude, m.dest_longitude, 15);
    trackMapEvent('meetup_tap', { meetupId: m.id });
  }, [mapFlyTo]);

  const recenter = () => {
    if (!safeMyCoords) return;
    mapFlyTo(safeMyCoords[0], safeMyCoords[1], 15);
    triggerHaptic('light');
  };

  const toggleSharing = () => {
    setSharing(!sharing);
    triggerHaptic('medium');
    toast.success(!sharing ? 'You\'re live on VybeMap' : 'Ghost Mode — you\'re hidden');
    setGhostOpen(false);
  };

  const handleGhostDuration = (ms: number) => {
    if (sharing) setSharing(false);
    triggerHaptic('medium');
    toast.success(`Ghost mode for ${Math.round(ms / 60_000)} min`);
    if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current);
    ghostTimerRef.current = setTimeout(() => {
      setSharing(true);
      toast.success('You\'re live on VybeMap again');
    }, ms);
    setGhostOpen(false);
  };

  const handleSearch = async (query: string) => {
    trackMapEvent('teleport', { q: query });
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data?.[0]) {
        mapFlyTo(parseFloat(data[0].lat), parseFloat(data[0].lon), 12);
        toast.success(`Jumped to ${data[0].display_name.split(',')[0]}`);
      } else {
        toast.error('Could not find that place');
      }
    } catch {
      toast.error('Could not find that place');
    }
  };

  const handleDropSpot = () => {
    if (!safeMyCoords) {
      toast.error('Enable location to drop a spot');
      return;
    }
    setSettingsOpen(false);
    setSpotDropOpen(true);
    trackMapEvent('spot_drop_open');
  };

  const handleFindFriend = useCallback((friend: LiveFriend) => {
    void startFind.mutateAsync(friend.user_id);
    setSelId(null);
    setFindMode({ friend, ar: false });
    trackMapEvent('find_friend_start');
    triggerHaptic('medium');
  }, [startFind]);

  return (
    <div
      className="fixed inset-0 w-full h-full overflow-hidden vybe-map-shell isolate"
      style={{ overscrollBehavior: 'none', zIndex: 9999 }}
    >
      <div ref={mapEl} className={useMapbox ? 'absolute inset-0 z-0 pointer-events-none opacity-0' : 'absolute inset-0 z-0'} />

      {useMapbox ? (
        <VybeMapboxCanvas
          {...mapProps}
          mapMode={mapViewMode}
          onMapReady={setMap}
          routeGeometry={route?.geometry ?? null}
          squadMemberIds={squadSet}
          onMeetupTap={handleMeetupTap}
        />
      ) : (
        <Suspense fallback={null}>
          <VybeMapLeafletFallback
            {...mapProps}
            mapElRef={mapEl}
            onMapReady={(m) => { leafletMapRef.current = m; }}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 vybe-map-bottom-fade z-[500]" />

      <MapSnapTopBar
        onBack={() => navigate(-1)}
        onSearch={(q) => void handleSearch(q)}
        onOpenSettings={() => setSettingsOpen(true)}
        radarLabel={radar.label}
        liveSharing={sharing}
        squadChip={
          activeSquad && layers.groups
            ? { label: `${activeSquad.emoji} ${activeSquad.name}`, onClear: () => { setActiveSquad(null); toggleLayer('groups'); } }
            : null
        }
      />

      {routeLoading && (
        <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-[1001] top-[calc(var(--app-header-height)+0.5rem)]">
          <span className="vybe-map-chip text-[11px] text-white/85 inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Routing…
          </span>
        </div>
      )}

      <AnimatePresence>
        {route && (
          <MapRouteBar
            label={route.label}
            durationMinutes={route.durationMinutes}
            distanceMiles={route.distanceMiles}
            destIntel={routeDestIntel}
            onClose={() => setRoute(null)}
            onOpenExternal={() => window.open(route.externalUrl, '_blank')}
          />
        )}
      </AnimatePresence>

      <MapFloatingActions
        onRecenter={recenter}
        onFind={
          sel && safeMyCoords && !findMode
            ? () => handleFindFriend(sel)
            : undefined
        }
        findLabel={sel ? `Find ${(sel.profile?.username || sel.profile?.display_name || 'friend').split(' ')[0]}` : 'Find'}
      />

      <AnimatePresence>
        {ghostOpen && (
          <GhostModeSheet sharing={sharing} onClose={() => setGhostOpen(false)} onToggleSharing={toggleSharing} onGhostDuration={handleGhostDuration} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <MapSettingsSheet
            mapMode={mapViewMode}
            layers={layers}
            sharing={sharing}
            hasMapbox={useMapbox}
            onMapMode={setMapViewMode}
            onToggleLayer={(key) => { toggleLayer(key); trackMapEvent('layer_toggle', { layer: key }); }}
            onGhost={() => { setSettingsOpen(false); setGhostOpen(true); }}
            onSquads={() => { setSettingsOpen(false); setSquadsOpen(true); }}
            onDropSpot={handleDropSpot}
            onPlanMeetup={() => {
              setSettingsOpen(false);
              if (safeMyCoords) setMeetupCreateOpen(true);
              else toast.error('Enable location first');
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sel && safeMyCoords && (
          <FriendCardSheet
            friend={sel}
            myCoords={safeMyCoords}
            headingToward={isHeadingTowardYou(sel, safeMyCoords)}
            routeEtaMinutes={route?.label?.includes(sel.profile?.display_name || sel.profile?.username || '') ? route.durationMinutes : null}
            onClose={() => setSelId(null)}
            onMessage={() => navigate('/messages')}
            onNavigate={() => {
              const lat = sel.displayLat ?? sel.latitude;
              const lng = sel.displayLng ?? sel.longitude;
              const name = sel.profile?.display_name || sel.profile?.username || 'Friend';
              void startLiveRoute(`Route to ${name}`, [lat, lng]);
            }}
            onLiveRoute={() => {
              const lat = sel.displayLat ?? sel.latitude;
              const lng = sel.displayLng ?? sel.longitude;
              const name = sel.profile?.display_name || sel.profile?.username || 'Friend';
              void startLiveRoute(`Route to ${name}`, [lat, lng]);
            }}
            onWave={async () => {
              if (!effectiveId) return;
              const name = profile?.display_name || profile?.username || 'Someone';
              await sendMapWave(effectiveId, sel.user_id, name);
              trackMapEvent('map_wave', { to: sel.user_id });
            }}
            onFind={() => handleFindFriend(sel)}
            onProfile={() => { const u = sel.profile?.username; if (u) navigate(`/u/${u}`); }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {findMode && safeMyCoords && (
          <FindFriendOverlay friend={findMode.friend} myCoords={safeMyCoords} arMode={findMode.ar} onClose={() => setFindMode(null)} onFound={() => trackMapEvent('find_friend_found')} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {spotDropOpen && safeMyCoords && (
          <SpotDropSheet
            coords={safeMyCoords}
            onClose={() => setSpotDropOpen(false)}
            onSubmit={async (input) => {
              await createSpot.mutateAsync({ ...input, latitude: safeMyCoords[0], longitude: safeMyCoords[1] });
              trackMapEvent('spot_dropped');
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selPlace && (
          <PlacePageSheet
            place={selPlace}
            onClose={() => setSelPlace(null)}
            onNavigate={() => {
              void startLiveRoute(selPlace.name, [selPlace.latitude, selPlace.longitude], { dismissSheets: false });
            }}
            onCheckIn={() => {
              checkIn.mutate(
                {
                  latitude: selPlace.latitude,
                  longitude: selPlace.longitude,
                  message: `At ${selPlace.name}`,
                  placeId: selPlace.id,
                  placeName: selPlace.name,
                },
                { onSuccess: () => toast.success('Checked in!') },
              );
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selMeetup && (
          <MeetupSheet
            meetup={selMeetup}
            myCoords={safeMyCoords}
            profileId={profileId ?? profile?.id}
            isMember={meetupMemberships?.has(selMeetup.id) ?? selMeetup.host_id === profile?.id}
            isHost={selMeetup.host_id === profile?.id}
            onClose={() => setSelMeetup(null)}
            onJoin={async () => {
              await joinMeetup.mutateAsync(selMeetup.id);
              trackMapEvent('meetup_join', { meetupId: selMeetup.id });
            }}
            onLeave={async () => leaveMeetup.mutateAsync(selMeetup.id)}
            onNavigate={() => {
              void startLiveRoute(
                selMeetup.title,
                [selMeetup.dest_latitude, selMeetup.dest_longitude],
                { dismissSheets: false },
              );
              trackMapEvent('meetup_tap', { meetupId: selMeetup.id, action: 'directions' });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {meetupCreateOpen && safeMyCoords && (
          <MeetupCreateSheet
            coords={safeMyCoords}
            onClose={() => setMeetupCreateOpen(false)}
            onSubmit={async ({ title, description }) => {
              await createMeetup.mutateAsync({
                title,
                description,
                dest_latitude: safeMyCoords[0],
                dest_longitude: safeMyCoords[1],
                dest_label: title,
              });
              trackMapEvent('meetup_create');
              if (!layers.meetups) toggleLayer('meetups');
              setDiscoveryOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {squadsOpen && (
          <GroupMapSheet
            groups={groupMaps}
            onClose={() => setSquadsOpen(false)}
            onCreate={async (input) => {
              await createGroupMap.mutateAsync(input);
              toggleLayer('groups');
            }}
            onSelect={(g) => {
              setActiveSquad(g);
              toggleLayer('groups');
              setSquadsOpen(false);
              toast.success(`${g.name} squad on map`);
            }}
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
        friendCheckIns={friendCheckIns}
        onFriendTap={(f) => { setSelId(f.user_id); mapFlyTo(f.displayLat ?? f.latitude, f.displayLng ?? f.longitude, 16); }}
        onMeetupTap={(m) => {
          handleMeetupTap(m);
          setDiscoveryOpen(false);
        }}
        onPlaceTap={(p) => setSelPlace(p)}
        onCreateMeetup={() => {
          if (safeMyCoords) setMeetupCreateOpen(true);
          else toast.error('Enable location first');
        }}
      />
    </div>
  );
}

const VybeMapInnerMemo = memo(VybeMapInner);

export default function VybeMap() {
  return (
    <MapErrorBoundary>
      <VybeMapInnerMemo />
    </MapErrorBoundary>
  );
}
