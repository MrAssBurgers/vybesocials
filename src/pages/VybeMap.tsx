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
import { isValidLatLng, distanceMeters } from '@/lib/vybemap/geo';
import { type LiveFriend, type MapPlace, type MapMeetup } from '@/lib/vybemap/types';
import {
  useMapLayers, useMapViewMode, useMapFollowHeading, useFriendIds, useLiveFriends, useMapStories, useMapPosts,
  useMapClips, useMapMeetups, useMapHeatmap, useMapPlaces, useMapEventPins,
  useFriendRadar, useStartFindFriend, useCheckIn, useCreateMapSpot, useLogLocationAccess,
  useFriendCheckIns, useCreateMeetup, useJoinMeetup, useLeaveMeetup, useMyMeetupMemberships,
  useGroupMaps, useCreateGroupMap, useGroupMemberIds,
} from '@/hooks/vybemap/useVybeMap';
import { FindFriendOverlay } from '@/components/vybemap/FindFriendOverlay';
import { FriendCardSheet } from '@/components/vybemap/FriendCardSheet';
import { openFriendProfile } from '@/lib/friendProfileRoutes';
import { DiscoveryDrawer } from '@/components/vybemap/DiscoveryDrawer';
import { SpotDropSheet } from '@/components/vybemap/SpotDropSheet';
import { PlacePageSheet } from '@/components/vybemap/PlacePageSheet';
import { MeetupSheet, MeetupCreateSheet } from '@/components/vybemap/MeetupSheet';
import { GroupMapSheet } from '@/components/vybemap/GroupMapSheet';
import { MapRouteBar, MapRouteMinimizedChip } from '@/components/vybemap/MapRouteBar';
import { RouteOriginPicker, type RouteOriginChoice } from '@/components/vybemap/RouteOriginPicker';
import { useLocationIntel } from '@/hooks/vybemap/useLocationIntel';
import { hasMapbox } from '@/lib/vybemap/mapbox/config';
import { fetchMapboxRoute } from '@/lib/vybemap/mapbox/directions';
import { resolveTeleportQuery } from '@/lib/vybemap/mapbox/geocode';
import { externalDirectionsUrl } from '@/lib/vybemap/mapNavigation';
import { isHeadingTowardYou } from '@/lib/vybemap/headingToward';
import { sendMapWave } from '@/lib/vybemap/mapSocial';
import type { MapGroupMap } from '@/lib/vybemap/types';
import { useVybeMapFlyTo } from '@/components/vybemap/map/useVybeMapFlyTo';
import { GhostModeSheet } from '@/components/vybemap/hud/GhostModeSheet';
import { MapSnapTopBar } from '@/components/vybemap/hud/MapSnapTopBar';
import { MapSettingsSheet } from '@/components/vybemap/hud/MapSettingsSheet';
import { MapFloatingActions } from '@/components/vybemap/hud/MapFloatingActions';

// Prefetch Mapbox chunk as soon as this module evaluates so Follow can engage faster.
const mapboxCanvasImport = import('@/components/vybemap/map/VybeMapboxCanvas');
const VybeMapboxCanvas = lazy(() =>
  mapboxCanvasImport.then((m) => ({
    default: m.VybeMapboxCanvas,
  })),
);

const VybeMapLeafletFallback = lazy(() =>
  import('@/components/vybemap/map/VybeMapLeafletFallback').then((m) => ({
    default: m.VybeMapLeafletFallback,
  })),
);

/** Same pulse the canvas shows while the style loads — no flash of nothing. */
function MapCanvasLoading() {
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center vybe-map-loading">
      <div className="vybe-map-loading-pulse" aria-hidden />
    </div>
  );
}

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
  const {
    coords: myCoords,
    sharing,
    locationAvailable,
    locationDenied,
    setSharing,
    heading: myHeading,
    enableTemporaryGhost,
    exitGhost,
  } = useLocationContext();
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
  const { setMap, flyTo, flyToUser, startWander, resetBearing } = useVybeMapFlyTo();
  const mapInstanceRef = useRef<{ getCenter: () => { lat: number; lng: number } } | null>(null);

  const [selId, setSelId] = useState<string | null>(null);
  const [selPlace, setSelPlace] = useState<MapPlace | null>(null);
  const [selMeetup, setSelMeetup] = useState<MapMeetup | null>(null);
  const [meetupCreateOpen, setMeetupCreateOpen] = useState(false);
  const [spotDropOpen, setSpotDropOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [findMode, setFindMode] = useState<{ friend: LiveFriend; ar: boolean } | null>(null);
  const { mapViewMode, setMapViewMode } = useMapViewMode();
  const { followHeading, setFollowHeading, toggleFollowHeading } = useMapFollowHeading();
  const [squadsOpen, setSquadsOpen] = useState(false);
  const [activeSquad, setActiveSquad] = useState<MapGroupMap | null>(null);
  const { data: squadMemberIds = [] } = useGroupMemberIds(activeSquad?.id);
  const [route, setRoute] = useState<{
    label: string;
    dest: [number, number];
    origin: [number, number];
    originKind: RouteOriginChoice;
    geometry: GeoJSON.LineString;
    durationMinutes: number;
    distanceMiles: number;
    externalUrl: string;
  } | null>(null);
  /** false = card minimized; route polyline stays on the map until End. */
  const [routeBarExpanded, setRouteBarExpanded] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [pendingRoute, setPendingRoute] = useState<{ label: string; dest: [number, number] } | null>(null);
  const { data: routeDestIntel } = useLocationIntel({
    latitude: route?.dest[0] ?? 0,
    longitude: route?.dest[1] ?? 0,
    placeName: route?.label.replace(/^Route to /, ''),
    enabled: !!route,
  });

  const mapEl = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<L.Map | null>(null);
  const safeMyCoords = useMemo(
    () => (myCoords && isValidLatLng(myCoords[0], myCoords[1]) ? myCoords : null),
    [myCoords],
  );
  const effectiveLiveSharing = sharing && locationAvailable && !!safeMyCoords && !locationDenied;
  const sel = useMemo(() => friends.find((f) => f.user_id === selId) || null, [friends, selId]);
  const squadSet = useMemo(
    () => (layers.groups && activeSquad ? new Set(squadMemberIds) : undefined),
    [layers.groups, activeSquad, squadMemberIds],
  );

  const readMapCameraCoords = useCallback((): [number, number] | null => {
    try {
      const c = mapInstanceRef.current?.getCenter();
      if (c && isValidLatLng(c.lat, c.lng)) return [c.lat, c.lng];
    } catch { /* ignore */ }
    try {
      const lc = leafletMapRef.current?.getCenter();
      if (lc && isValidLatLng(lc.lat, lc.lng)) return [lc.lat, lc.lng];
    } catch { /* ignore */ }
    return null;
  }, []);

  const runLiveRoute = useCallback(async (
    label: string,
    dest: [number, number],
    origin: [number, number],
    originKind: RouteOriginChoice,
    options?: { dismissSheets?: boolean },
  ) => {
    const externalUrl = externalDirectionsUrl(dest[0], dest[1]);
    if (options?.dismissSheets !== false) {
      setSelId(null);
      setSelPlace(null);
      setSelMeetup(null);
      setDiscoveryOpen(false);
      setSettingsOpen(false);
    }
    setPendingRoute(null);
    setRouteLoading(true);
    try {
      const result = await fetchMapboxRoute(origin, dest);
      if (result) {
        setRoute({
          label,
          dest,
          origin,
          originKind,
          geometry: result.geometry,
          durationMinutes: result.durationMinutes,
          distanceMiles: result.distanceMiles,
          externalUrl,
        });
        setRouteBarExpanded(true);
        triggerHaptic('light');
        trackMapEvent('live_route' as never, { origin: originKind });
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
  }, []);

  const endLiveRoute = useCallback(() => {
    setRoute(null);
    setRouteBarExpanded(true);
    setPendingRoute(null);
    toast.message('Navigation ended');
  }, []);

  /** Request a route — may open origin picker (live GPS vs map camera). */
  const startLiveRoute = useCallback(async (
    label: string,
    dest: [number, number],
    options?: { dismissSheets?: boolean },
  ) => {
    const externalUrl = externalDirectionsUrl(dest[0], dest[1]);
    const mapCoords = readMapCameraCoords();
    const cameraOffLive =
      !!safeMyCoords &&
      !!mapCoords &&
      distanceMeters(safeMyCoords, mapCoords) > 80;

    // Changing destination or navigating from a panned map → ask live vs map position.
    if (route || cameraOffLive) {
      if (options?.dismissSheets !== false) {
        setSelId(null);
        setSelPlace(null);
        setSelMeetup(null);
        setDiscoveryOpen(false);
        setSettingsOpen(false);
      }
      setPendingRoute({ label, dest });
      return;
    }

    if (!safeMyCoords) {
      if (mapCoords) {
        await runLiveRoute(label, dest, mapCoords, 'map', options);
        return;
      }
      window.open(externalUrl, '_blank');
      return;
    }

    await runLiveRoute(label, dest, safeMyCoords, 'live', options);
  }, [readMapCameraCoords, safeMyCoords, route, runLiveRoute]);

  const confirmRouteOrigin = useCallback((originKind: RouteOriginChoice) => {
    if (!pendingRoute) return;
    const origin =
      originKind === 'live' ? safeMyCoords : readMapCameraCoords();
    if (!origin) {
      toast.error(originKind === 'live' ? 'Live location unavailable' : 'Map position unavailable');
      return;
    }
    void runLiveRoute(pendingRoute.label, pendingRoute.dest, origin, originKind);
  }, [pendingRoute, safeMyCoords, readMapCameraCoords, runLiveRoute]);

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
    // [iOS-only] DeviceOrientation permission needs a gesture on Safari; Despia may
    // already allow it. Request early so compass works when follow-heading is on.
    if (followHeading) {
      void import('@/lib/vybemap/deviceHeading').then(({ ensureDeviceOrientationPermission }) =>
        ensureDeviceOrientationPermission(),
      );
    }
    return () => {
      navVisibility.setImmersiveView(false);
      document.body.classList.remove('hide-bottom-nav');
    };
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
    if (!safeMyCoords) {
      toast.error('Enable location to center the map on you');
      return;
    }
    // Only this button re-engages GPS follow after the user pans away.
    if (useMapbox) flyToUser(safeMyCoords[0], safeMyCoords[1], 15);
    else mapFlyTo(safeMyCoords[0], safeMyCoords[1], 15);
    triggerHaptic('light');
  };

  const toggleSharing = () => {
    if (effectiveLiveSharing) {
      setSharing(false);
      triggerHaptic('medium');
      toast.success("Ghost Mode — you're hidden");
    } else {
      if (!locationAvailable || !safeMyCoords || locationDenied) {
        toast.error('Enable location permission before going live on VybeMap');
        return;
      }
      exitGhost();
      triggerHaptic('medium');
      toast.success("You're live on VybeMap");
    }
    setGhostOpen(false);
  };

  const handleGhostDuration = (ms: number) => {
    enableTemporaryGhost(ms);
    triggerHaptic('medium');
    toast.success(`Ghost mode for ${Math.round(ms / 60_000)} min`);
    setGhostOpen(false);
  };

  const handleStatusChip = () => {
    if (!locationAvailable || !safeMyCoords || locationDenied) {
      toast.error('Location is off — enable permission in your browser or device settings');
      return;
    }
    if (effectiveLiveSharing) {
      setGhostOpen(true);
      return;
    }
    // One tap to leave Ghost — don't trap users behind Settings.
    exitGhost();
    triggerHaptic('medium');
    toast.success("You're live on VybeMap");
  };

  const handleSearch = async (query: string) => {
    trackMapEvent('teleport', { q: query });
    const hit = await resolveTeleportQuery(query);
    if (hit) {
      mapFlyTo(hit.lat, hit.lng, 12);
      toast.success(`Jumped to ${hit.label}`);
      return;
    }
    toast.error('Could not find that place');
  };

  const handleWander = useCallback(() => {
    setFollowHeading(false);
    if (useMapbox) {
      startWander(safeMyCoords?.[0], safeMyCoords?.[1]);
    } else {
      void import('@/components/vybemap/map/VybeMapLeafletFallback').then(({ leafletWander }) => {
        leafletWander(leafletMapRef.current, safeMyCoords?.[0], safeMyCoords?.[1]);
      });
    }
    triggerHaptic('light');
    toast.success('Wander — free pan & explore');
  }, [useMapbox, startWander, safeMyCoords, setFollowHeading]);

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
    <main
      aria-label="VybeMap"
      className="fixed inset-0 w-full h-full overflow-hidden vybe-map-shell isolate"
      style={{ overscrollBehavior: 'none', zIndex: 9999 }}
    >
      <div ref={mapEl} className={useMapbox ? 'absolute inset-0 z-0 pointer-events-none opacity-0' : 'absolute inset-0 z-0'} />

      {useMapbox ? (
        <Suspense fallback={<MapCanvasLoading />}>
          <VybeMapboxCanvas
            {...mapProps}
            mapMode={mapViewMode}
            followHeading={followHeading}
            userHeading={myHeading}
            onMapReady={(m) => {
              setMap(m);
              mapInstanceRef.current = m;
            }}
            routeGeometry={route?.geometry ?? null}
            squadMemberIds={squadSet}
            onMeetupTap={handleMeetupTap}
          />
        </Suspense>
      ) : (
        <Suspense fallback={null}>
          <VybeMapLeafletFallback
            {...mapProps}
            mapElRef={mapEl}
            onMapReady={(m) => {
              leafletMapRef.current = m;
              mapInstanceRef.current = m;
            }}
          />
        </Suspense>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 vybe-map-bottom-fade z-[500]" />

      <MapSnapTopBar
        onBack={() => navigate(-1)}
        onSearch={(q) => void handleSearch(q)}
        onOpenSettings={() => setSettingsOpen(true)}
        radarLabel={radar.label}
        liveSharing={effectiveLiveSharing}
        locationAvailable={locationAvailable && !!safeMyCoords && !locationDenied}
        onStatusChip={handleStatusChip}
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
        {route && routeBarExpanded && (
          <MapRouteBar
            label={route.label}
            durationMinutes={route.durationMinutes}
            distanceMiles={route.distanceMiles}
            destIntel={routeDestIntel}
            originLabel={route.originKind === 'map' ? 'From map pin' : 'From live GPS'}
            onMinimize={() => setRouteBarExpanded(false)}
            onEnd={endLiveRoute}
            onOpenExternal={() => window.open(route.externalUrl, '_blank')}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {route && !routeBarExpanded && (
          <MapRouteMinimizedChip
            label={route.label}
            onExpand={() => setRouteBarExpanded(true)}
            onEnd={endLiveRoute}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pendingRoute && (
          <RouteOriginPicker
            label={pendingRoute.label}
            hasLiveLocation={!!safeMyCoords}
            hasMapPosition={!!readMapCameraCoords()}
            onChoose={confirmRouteOrigin}
            onCancel={() => setPendingRoute(null)}
          />
        )}
      </AnimatePresence>

      <MapFloatingActions
        onRecenter={recenter}
        followHeading={followHeading}
        onToggleFollowHeading={() => {
          void import('@/lib/vybemap/deviceHeading').then(({ ensureDeviceOrientationPermission }) =>
            ensureDeviceOrientationPermission(),
          );
          toggleFollowHeading();
          triggerHaptic('light');
          toast.success(followHeading ? 'Map unlocked — pan & zoom freely' : 'Map follows your direction');
        }}
        onResetBearing={resetBearing}
        onFind={
          sel && safeMyCoords && !findMode
            ? () => handleFindFriend(sel)
            : undefined
        }
        findLabel={sel ? `Find ${(sel.profile?.username || sel.profile?.display_name || 'friend').split(' ')[0]}` : 'Find'}
      />

      <AnimatePresence>
        {ghostOpen && (
          <GhostModeSheet sharing={effectiveLiveSharing} onClose={() => setGhostOpen(false)} onToggleSharing={toggleSharing} onGhostDuration={handleGhostDuration} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <MapSettingsSheet
            mapMode={mapViewMode}
            layers={layers}
            sharing={effectiveLiveSharing}
            hasMapbox={useMapbox}
            followHeading={followHeading}
            onFollowHeading={setFollowHeading}
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
            onWander={handleWander}
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
              trackMapEvent('map_wave' as any, { to: sel.user_id });
            }}
            onFind={() => handleFindFriend(sel)}
            onProfile={() => { const u = sel.profile?.username; if (u) openFriendProfile(navigate, { username: u, friendshipStatus: 'friends' }); }}
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
    </main>
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
