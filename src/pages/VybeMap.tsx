import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense, Component, memo, type ReactNode, type ErrorInfo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, RefreshCw } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import type L from 'leaflet';

import { useAuth } from '@/lib/auth';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useLocationContext } from '@/providers/LocationProvider';
import { navVisibility } from '@/lib/navVisibility';
import { triggerHaptic } from '@/lib/haptics';
import { toast } from 'sonner';
import { captureMapLocationLease, currentMapLocation, type MapLocationLease } from '@/lib/vybemap/mapLocationLease';
import { trackMapEvent } from '@/lib/vybemap/analytics';
import { isValidLatLng, distanceMeters } from '@/lib/vybemap/geo';
import { type LiveFriend, type MapPlace, type MapMeetup } from '@/lib/vybemap/types';
import {
  useMapLayers, useMapViewMode, useMapFollowHeading, useFriendIds, useLiveFriends, useMapStories, useMapPosts,
  useMapClips, useMapMeetups, useMapHeatmap, useMapPlaces, useMapEventPins,
  useFriendRadar, useStartFindFriend, useCreateMapSpot, useLogLocationAccess,
  useFriendCheckIns, useCreateMeetup,
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
import { useMapSearch } from '@/hooks/vybemap/useMapSearch';
import { externalDirectionsUrl } from '@/lib/vybemap/mapNavigation';
import { isHeadingTowardYou } from '@/lib/vybemap/headingToward';
import { useMapWave } from '@/hooks/vybemap/useMapWave';
import { useSquadDetail, useSquadMatches } from '@/hooks/vybemap/useMapSquads';
import { useVybeMapFlyTo } from '@/components/vybemap/map/useVybeMapFlyTo';
import { GhostModeSheet } from '@/components/vybemap/hud/GhostModeSheet';
import { MapSnapTopBar } from '@/components/vybemap/hud/MapSnapTopBar';
import { MapSettingsSheet } from '@/components/vybemap/hud/MapSettingsSheet';
import { MapFloatingActions } from '@/components/vybemap/hud/MapFloatingActions';
import { MapViewport } from '@/components/vybemap/MapViewport';
import { useQueryClient } from '@tanstack/react-query';
import { useMapSocialRouteAdmission } from '@/hooks/vybemap/useMapSocial';
import { useMapFriendChat } from '@/hooks/vybemap/useMapFriendChat';
import { currentMapSocialRoute, mapRouteAccountScope, type MapSocialRouteLease } from '@/lib/vybemap/mapSocialRouteLease';

// Use the existing 3D renderer by default in both preview and production.
const mapboxCanvasImport = hasMapbox() ? import('@/components/vybemap/map/VybeMapboxCanvas') : null;
const VybeMapboxCanvas = lazy(() =>
  (mapboxCanvasImport || import('@/components/vybemap/map/VybeMapboxCanvas')).then((m) => ({
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
  const mapLocation = useLocation();
  const locationAccount = useProfileAccount();
  const routeQueryClient = useQueryClient();
  const routeAccountScope = mapRouteAccountScope(locationAccount.user?.id, locationAccount.profile?.id, locationAccount.session.epoch);
  const sharingView = useRef(true);
  useEffect(() => { sharingView.current = true; return () => { sharingView.current = false; }; }, []);
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const {
    coords: myCoords,
    sharing, sharingEnabled, sharingPending, sharingReady, sharingError, legacySharingNeedsReview, retrySharing,
    locationAvailable,
    locationDenied,
    setSharing,
    heading: myHeading,
    enableTemporaryGhost,
    exitGhost,
    requestLocation,
  } = useLocationContext();
  const [flatFallback, setFlatFallback] = useState(false);
  const useMapbox = !flatFallback;

  const { layers, toggleLayer, setLayers } = useMapLayers();
  const friendQuery = useFriendIds(profileId ?? profile?.id);
  const friendIds = friendQuery.data;
  const liveQuery = useLiveFriends(friendIds);
  const friends = liveQuery.data;
  const locationScope = JSON.stringify([locationAccount.session.uid, locationAccount.session.epoch]);
  const locationView = useRef({ scope: locationScope, friends });
  locationView.current = { scope: locationScope, friends };
  const routeWork = useRef(0);
  const checkInsQuery = useFriendCheckIns(friendIds);
  const friendCheckIns = checkInsQuery.data || [];
  const { data: stories = [] } = useMapStories(layers.stories);
  const { data: posts = [] } = useMapPosts(layers.posts);
  const { data: clips = [] } = useMapClips(layers.clips);
  const meetupsQuery = useMapMeetups(layers.meetups);
  const meetups = meetupsQuery.data || [];
  const { data: heatmap = [] } = useMapHeatmap(layers.heatmap);
  const placesQuery = useMapPlaces(layers.trending || layers.hotspots);
  const places = placesQuery.data || [];
  const { data: eventPins = [] } = useMapEventPins(layers.events);

  const radar = useFriendRadar(friends, myCoords);
  const startFind = useStartFindFriend();
  const createSpot = useCreateMapSpot();
  const createMeetup = useCreateMeetup();
  const logAccess = useLogLocationAccess();
  const { mapViewMode, setMapViewMode } = useMapViewMode();
  const { setMap, flyTo, flyToUser, startWander, resetBearing } = useVybeMapFlyTo(mapViewMode);
  const mapInstanceRef = useRef<{ getCenter: () => { lat: number; lng: number } } | null>(null);

  const [selId, setSelId] = useState<string | null>(null);
  const [selPlace, setSelPlace] = useState<MapPlace | null>(null);
  const [selMeetup, setSelMeetup] = useState<MapMeetup | null>(null);
  const [meetupCreateOpen, setMeetupCreateOpen] = useState(false);
  const [spotDropOpen, setSpotDropOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ghostOpen, setGhostOpen] = useState(false);
  const [discoveryOpen, setDiscoveryOpen] = useState(false);
  const [findState, setFindMode] = useState<{ lease: MapLocationLease; ar: boolean } | null>(null);
  const currentFindFriend = currentMapLocation(findState?.lease, locationScope, friends);
  const findMode = currentFindFriend && findState ? { friend: currentFindFriend, ar: findState.ar } : null;
  const { followHeading, setFollowHeading, toggleFollowHeading } = useMapFollowHeading();
  const [squadsOpen, setSquadsOpen] = useState(false);
  const [selectedSquad, setSelectedSquad] = useState<{ id: string; scope: string } | null>(null);
  const [squadInvitation, setSquadInvitation] = useState<{ token: string; scope: string } | null>(null);
  const squadId = selectedSquad?.scope === routeAccountScope ? selectedSquad.id : undefined;
  const selectedSquadQuery = useSquadDetail(squadId);
  const activeSquad = selectedSquadQuery.data?.squad?.status === 'active' ? selectedSquadQuery.data.squad : null;
  const squadCandidates = useMemo(() => friends.map(friend => friend.user_id), [friends]);
  const squadMatches = useSquadMatches(activeSquad?.id, squadCandidates);
  useEffect(() => {
    const hash = new URLSearchParams(mapLocation.hash.slice(1));
    if (!hash.has('squad-invite')) return;
    const token = (hash.get('squad-invite') || '').slice(0, 128);
    setSquadInvitation({ token, scope: routeAccountScope }); setSquadsOpen(true);
    hash.delete('squad-invite');
    navigate({ pathname: mapLocation.pathname, search: mapLocation.search, hash: hash.toString() ? `#${hash}` : '' }, { replace: true });
  }, [mapLocation.hash, mapLocation.pathname, mapLocation.search, navigate, routeAccountScope]);
  const [routeState, setRoute] = useState<{
    scope: string; friendLease?: MapLocationLease; socialLease?: MapSocialRouteLease;
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
  const [pendingRouteState, setPendingRoute] = useState<{ label: string; dest: [number, number]; scope: string; friendLease?: MapLocationLease; socialLease?: MapSocialRouteLease } | null>(null);
  const routeAdmission = useMapSocialRouteAdmission(routeState?.socialLease);
  const pendingAdmission = useMapSocialRouteAdmission(pendingRouteState?.socialLease);
  const route = routeState?.scope === locationScope && (!routeState.friendLease || currentMapLocation(routeState.friendLease, locationScope, friends)) && (!routeState.socialLease || routeAdmission) ? routeState : null;
  const pendingRoute = pendingRouteState?.scope === locationScope && (!pendingRouteState.friendLease || currentMapLocation(pendingRouteState.friendLease, locationScope, friends)) && (!pendingRouteState.socialLease || pendingAdmission) ? pendingRouteState : null;
  useEffect(() => {
    if (routeState && !route) { routeWork.current++; setRoute(null); setRouteLoading(false); }
    if (pendingRouteState && !pendingRoute) setPendingRoute(null);
    if (findState && !findMode) setFindMode(null);
  }, [routeState, route, pendingRouteState, pendingRoute, findState, !!findMode]);
  useEffect(() => {
    const deadlines = [routeState?.friendLease?.sampleExpiresAt, pendingRouteState?.friendLease?.sampleExpiresAt].filter((value): value is number => typeof value === 'number');
    if (!deadlines.length) return;
    const timer = setTimeout(() => {
      routeWork.current++;
      setRoute(value => value?.friendLease?.sampleExpiresAt && value.friendLease.sampleExpiresAt <= Date.now() ? null : value);
      setPendingRoute(value => value?.friendLease?.sampleExpiresAt && value.friendLease.sampleExpiresAt <= Date.now() ? null : value);
      setRouteLoading(false);
    }, Math.max(0, Math.min(...deadlines) - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [routeState?.friendLease?.sampleExpiresAt, pendingRouteState?.friendLease?.sampleExpiresAt]);
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
  const friendChat = useMapFriendChat(sel, id => navigate(`/messages/${encodeURIComponent(id)}`));
  const friendWave = useMapWave(sel, selId);
  const squadSet = useMemo(
    () => (layers.groups && activeSquad && squadMatches.data ? new Set(squadMatches.data.matchedProfileIds) : undefined),
    [layers.groups, activeSquad, squadMatches.data],
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
    options?: { dismissSheets?: boolean; friendLease?: MapLocationLease; socialLease?: MapSocialRouteLease },
  ) => {
    const lease = options?.friendLease, scope = locationScope, operation = ++routeWork.current;
    const accountGuard = locationAccount.guard;
    const guard = () => { accountGuard(); if (!sharingView.current || operation !== routeWork.current || scope !== locationView.current.scope || (lease && !currentMapLocation(lease, scope, locationView.current.friends)) || (options?.socialLease && !currentMapSocialRoute(routeQueryClient, options.socialLease, routeAccountScope))) throw new Error('Location route expired.'); };
    try { guard(); } catch { return; }
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
      guard();
      if (result) {
        setRoute({
          scope, friendLease: lease, socialLease: options?.socialLease,
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
      try { guard(); } catch { return; }
      window.open(externalUrl, '_blank');
      toast.error('Could not load live route — opened Maps instead');
    } finally {
      if (sharingView.current && operation === routeWork.current && scope === locationView.current.scope) setRouteLoading(false);
    }
  }, [locationScope, locationAccount.guard, routeQueryClient, routeAccountScope]);

  const endLiveRoute = useCallback(() => {
    routeWork.current++; setRouteLoading(false);
    setRoute(null);
    setRouteBarExpanded(true);
    setPendingRoute(null);
    toast.message('Navigation ended');
  }, []);

  /** Request a route — may open origin picker (live GPS vs map camera). */
  const startLiveRoute = useCallback(async (
    label: string,
    dest: [number, number],
    options?: { dismissSheets?: boolean; friendLease?: MapLocationLease; socialLease?: MapSocialRouteLease },
  ) => {
    try { locationAccount.guard(); if (options?.friendLease && !currentMapLocation(options.friendLease, locationScope, friends)) return; if (options?.socialLease && !currentMapSocialRoute(routeQueryClient, options.socialLease, routeAccountScope)) return; } catch { return; }
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
      setPendingRoute({ label, dest, scope: locationScope, friendLease: options?.friendLease, socialLease: options?.socialLease });
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
  }, [readMapCameraCoords, safeMyCoords, route, runLiveRoute, locationScope, locationAccount.guard, friends, routeQueryClient, routeAccountScope]);

  const confirmRouteOrigin = useCallback((originKind: RouteOriginChoice) => {
    if (!pendingRoute) return;
    const origin =
      originKind === 'live' ? safeMyCoords : readMapCameraCoords();
    if (!origin) {
      toast.error(originKind === 'live' ? 'Live location unavailable' : 'Map position unavailable');
      return;
    }
    void runLiveRoute(pendingRoute.label, pendingRoute.dest, origin, originKind, { friendLease: pendingRoute.friendLease, socialLease: pendingRoute.socialLease, ...(pendingRoute.socialLease ? { dismissSheets: false } : {}) });
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
      requestLocation();
      toast.message('Checking location permission…');
      return;
    }
    // Only this button re-engages GPS follow after the user pans away.
    if (useMapbox) flyToUser(safeMyCoords[0], safeMyCoords[1], 15);
    else mapFlyTo(safeMyCoords[0], safeMyCoords[1], 15);
    triggerHaptic('light');
  };

  const confirmSharing = async (action: () => Promise<void>, message: string) => {
    const guard = locationAccount.guard;
    try {
      guard(); if (sharingPending) return;
      await action(); guard(); if (!sharingView.current) return;
      triggerHaptic('medium'); toast.success(message); setGhostOpen(false);
    } catch (error) {
      try { guard(); } catch { return; }
      if (sharingView.current) toast.error(error instanceof Error ? error.message : 'Location sharing was not confirmed. Retry.');
    }
  };
  const toggleSharing = () => {
    if (!sharingReady || sharingPending) return;
    if (sharingEnabled) return confirmSharing(() => setSharing(false), 'Ghost Mode confirmed. New location access is stopped.');
    if (!locationAvailable || !safeMyCoords || locationDenied) {
      requestLocation(); toast.message('Check location permission, then choose Share live location again.'); return;
    }
    return confirmSharing(exitGhost, 'Sharing enabled for friends you approve. Waiting for a fresh location update.');
  };
  const handleGhostDuration = (ms: number) => confirmSharing(() => enableTemporaryGhost(ms), `Ghost Mode confirmed for ${Math.round(ms / 60_000)} minutes while this app remains open.`);
  const handleStatusChip = () => { setGhostOpen(true); };

  const mapSearch = useMapSearch(hit => {
    mapFlyTo(hit.lat, hit.lng, 12);
    trackMapEvent('teleport');
    toast.success(`Jumped to ${hit.label}`);
  }, `${useMapbox}:${mapViewMode}`);

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
    try {
      locationAccount.guard();
      const lease = captureMapLocationLease(friend, locationScope);
      if (!currentMapLocation(lease, locationScope, friends)) return;
      void startFind.mutateAsync(friend.user_id).catch(() => { /* Finder display still depends on the current admitted location. */ });
      setSelId(null); setFindMode({ lease, ar: false });
      trackMapEvent('find_friend_start'); triggerHaptic('medium');
    } catch { /* A stale marker cannot start finding. */ }
  }, [startFind, locationScope, friends, locationAccount.guard]);

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
            onUseFlatFallback={() => setFlatFallback(true)}
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
            squadMemberIds={squadSet}
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
        onSearch={mapSearch.search}
        onCancelSearch={mapSearch.cancel}
        searchPending={mapSearch.isPending}
        searchError={mapSearch.error}
        onOpenSettings={() => setSettingsOpen(true)}
        radarLabel={radar.label}
        liveSharing={effectiveLiveSharing}
        sharingStatus={sharingPending ? 'Saving privacy…' : sharingError ? 'Check location sharing' : !sharingReady ? 'Checking privacy…' : sharingEnabled && !effectiveLiveSharing ? 'Waiting for location' : undefined}
        locationAvailable={locationAvailable && !!safeMyCoords && !locationDenied}
        onStatusChip={handleStatusChip}
        squadChip={
          activeSquad && layers.groups
            ? { label: `${activeSquad.emoji} ${activeSquad.name}`, onClear: () => { setSelectedSquad(null); setLayers(value => ({ ...value, groups: false })); } }
            : null
        }
      />

      {squadId && layers.groups && (selectedSquadQuery.isError || squadMatches.isError || !selectedSquadQuery.data || !activeSquad || !squadMatches.data) && (
        <div className="absolute left-3 right-3 top-28 z-[1100] mx-auto flex max-w-lg items-center gap-2 rounded-xl border border-border bg-background/95 p-3 text-xs" role="status">
          <span className="flex-1">{selectedSquadQuery.isError || squadMatches.isError ? 'Could not confirm squad highlights.' : selectedSquadQuery.data && !activeSquad ? 'This squad is no longer available.' : 'Checking squad highlights…'}</span>
          <button className="rounded-lg px-2 py-1 font-semibold" onClick={() => { void selectedSquadQuery.refetch(); if (activeSquad) void squadMatches.refetch(); }}>Retry squad</button>
          <button className="rounded-lg px-2 py-1 font-semibold" onClick={() => { setSelectedSquad(null); setLayers(value => ({ ...value, groups: false })); }}>Clear squad</button>
        </div>
      )}

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
            onOpenExternal={() => {
              try {
                locationAccount.guard();
                if (route.scope !== locationView.current.scope || (route.friendLease && !currentMapLocation(route.friendLease, route.scope, locationView.current.friends))) return;
                if (route.socialLease && !currentMapSocialRoute(routeQueryClient, route.socialLease, routeAccountScope)) return;
                window.open(route.externalUrl, '_blank');
              } catch { /* Retired routes cannot disclose the old destination. */ }
            }}
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
          <GhostModeSheet sharing={sharingEnabled} pending={sharingPending} ready={sharingReady} error={sharingError} legacyReview={legacySharingNeedsReview} onRetry={retrySharing} onClose={() => setGhostOpen(false)} onToggleSharing={toggleSharing} onGhostDuration={handleGhostDuration} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {settingsOpen && (
          <MapSettingsSheet
            mapMode={mapViewMode}
            layers={layers}
            sharing={effectiveLiveSharing} sharingStatus={sharingPending ? 'Saving privacy…' : sharingError || !sharingReady ? 'Check privacy' : sharingEnabled && !effectiveLiveSharing ? 'Waiting for location' : undefined}
            hasMapbox={useMapbox}
            followHeading={followHeading}
            onFollowHeading={setFollowHeading}
            onMapMode={setMapViewMode}
            onReturnTo3D={() => { setMapViewMode('3d'); setFlatFallback(false); }}
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
        {sel && (
          <FriendCardSheet
            friend={sel}
            myCoords={safeMyCoords}
            headingToward={isHeadingTowardYou(sel, safeMyCoords)}
            routeEtaMinutes={route?.label?.includes(sel.profile?.display_name || sel.profile?.username || '') ? route.durationMinutes : null}
            onClose={() => setSelId(null)}
            onMessage={() => void friendChat.open()}
            messagePending={friendChat.isPending}
            messageError={friendChat.error}
            onNavigate={() => {
              const lat = sel.displayLat ?? sel.latitude;
              const lng = sel.displayLng ?? sel.longitude;
              const name = sel.profile?.display_name || sel.profile?.username || 'Friend';
              void startLiveRoute(`Route to ${name}`, [lat, lng], { friendLease: captureMapLocationLease(sel, locationScope, true) });
            }}
            onLiveRoute={() => {
              const lat = sel.displayLat ?? sel.latitude;
              const lng = sel.displayLng ?? sel.longitude;
              const name = sel.profile?.display_name || sel.profile?.username || 'Friend';
              void startLiveRoute(`Route to ${name}`, [lat, lng], { friendLease: captureMapLocationLease(sel, locationScope, true) });
            }}
            onWave={() => void friendWave.send()}
            wavePending={friendWave.isPending}
            waveError={friendWave.error}
            waveMessage={friendWave.message}
            waveCooldownSeconds={friendWave.cooldownSeconds}
            waveAvailable={friendWave.isAvailable}
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
            key={`${locationScope}:spot`}
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
            key={`${locationScope}:${selPlace.id}`}
            place={selPlace}
            onClose={() => setSelPlace(null)}
            onNavigate={(place, socialLease) => {
              void startLiveRoute(place.name, [place.latitude, place.longitude], { dismissSheets: false, socialLease });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selMeetup && (
          <MeetupSheet
            key={`${locationScope}:${selMeetup.id}`}
            meetup={selMeetup}
            myCoords={safeMyCoords}
            onClose={() => setSelMeetup(null)}
            onNavigate={(meetup, socialLease) => {
              void startLiveRoute(meetup.title, [meetup.dest_latitude, meetup.dest_longitude], { dismissSheets: false, socialLease });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {meetupCreateOpen && safeMyCoords && (
          <MeetupCreateSheet
            key={`${locationScope}:meetup`}
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
            initialInvite={squadInvitation?.scope === routeAccountScope ? squadInvitation.token : undefined}
            onClose={() => { setSquadsOpen(false); setSquadInvitation(null); }}
            onSelect={(id) => {
              locationAccount.guard();
              setSelectedSquad({ id, scope: routeAccountScope });
              setLayers(value => ({ ...value, groups: true, friends: true }));
              setSquadsOpen(false);
              setSquadInvitation(null);
            }}
          />
        )}
      </AnimatePresence>

      <DiscoveryDrawer
        open={discoveryOpen}
        onToggle={() => { setDiscoveryOpen((v) => !v); trackMapEvent('discovery_open'); }}
        friends={friends}
        meetupsState={layers.meetups ? meetupsQuery : undefined}
        placesState={layers.trending || layers.hotspots ? placesQuery : undefined}
        checkInsState={checkInsQuery}
        friendsLoading={friendQuery.isLoading || liveQuery.isLoading}
        mapAttribution={<>{useMapbox && <><a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener" className="underline">© Mapbox</a>{' · '}</>}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener" className="underline">© OpenStreetMap contributors</a>{useMapbox && <>{' · '}<a href="https://apps.mapbox.com/feedback/" target="_blank" rel="noopener" className="underline">Improve this map</a></>}</>}
        friendsError={friendQuery.isError || liveQuery.isError}
        onRetryFriends={() => { void friendQuery.refetch(); void liveQuery.refetch(); }}
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
  const account = useProfileAccount();
  return (
    <MapViewport>
      <MapErrorBoundary>
        <VybeMapInnerMemo key={`${account.session.uid}:${account.session.epoch}`} />
      </MapErrorBoundary>
    </MapViewport>
  );
}
