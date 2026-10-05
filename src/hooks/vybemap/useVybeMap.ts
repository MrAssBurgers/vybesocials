import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import {
  type LiveFriend,
  type MapLayer,
  type TimeMachineMode,
  DEFAULT_LAYERS,
} from '@/lib/vybemap/types';
import {
  fetchFriendIds,
  fetchLiveFriends,
  subscribeLiveFriends,
  fetchMapStories,
  fetchMapPosts,
  fetchMapClips,
  fetchMapMeetups,
  fetchHeatmap,
  fetchMapPlaces,
  fetchEventPins,
  fetchPlacePosts,
  createPlacePost,
  fetchPlacePostComments,
  createPlacePostComment,
  fetchFriendCheckIns,
  joinMeetup,
  leaveMeetup,
  fetchMyMeetupMemberships,
  logLocationAccess,
  startFinderSession,
  createCheckIn,
  createMapSpot,
  createMeetup,
  fetchLocationHistory,
} from '@/lib/vybemap/firestore';
import { applyDisplayPositions } from '@/lib/vybemap/smoothing';
import { isValidLatLng } from '@/lib/vybemap/geo';
import { fetchMyGroupMaps, createGroupMap, joinGroupMap, fetchGroupMemberIds } from '@/lib/vybemap/mapSocial';
import {
  type MapViewMode,
  readStoredMapViewMode,
  persistMapViewMode,
} from '@/lib/vybemap/mapbox/config';
import { readMapFollowHeading, persistMapFollowHeading } from '@/lib/vybemap/mapFollowHeading';

const LAYERS_KEY = 'vybe-map-layers-v2';

export function useMapLayers() {
  const [layers, setLayers] = useState<Record<MapLayer, boolean>>(() => {
    try {
      const raw = localStorage.getItem(LAYERS_KEY);
      if (raw) return { ...DEFAULT_LAYERS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_LAYERS };
  });

  const toggleLayer = useCallback((layer: MapLayer) => {
    setLayers((prev) => {
      const next = { ...prev, [layer]: !prev[layer] };
      try { localStorage.setItem(LAYERS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  return { layers, toggleLayer, setLayers };
}

/** Remembers last map look (2D / 3D / satellite / …) across sessions. */
export function useMapViewMode() {
  const [mapViewMode, setMapViewModeState] = useState<MapViewMode>(readStoredMapViewMode);

  const setMapViewMode = useCallback((mode: MapViewMode) => {
    setMapViewModeState(mode);
    persistMapViewMode(mode);
  }, []);

  return { mapViewMode, setMapViewMode };
}

/** Toggle whether map bearing follows device compass (off = free pan/zoom/rotate). */
export function useMapFollowHeading() {
  const [followHeading, setFollowState] = useState(readMapFollowHeading);

  const setFollowHeading = useCallback((enabled: boolean) => {
    setFollowState(enabled);
    persistMapFollowHeading(enabled);
  }, []);

  const toggleFollowHeading = useCallback(() => {
    setFollowHeading(!followHeading);
  }, [followHeading, setFollowHeading]);

  return { followHeading, setFollowHeading, toggleFollowHeading };
}

const EMPTY_FRIEND_IDS: string[] = [];
const EMPTY_LIVE_FRIENDS: LiveFriend[] = [];
export function useFriendIds(profileId?: string) {
  const account = useProfileAccount();
  const enabled = account.ready && !!profileId && account.profile?.id === profileId;
  const result = useQuery({
    queryKey: ['vybemap-friend-ids', profileId, account.session.uid, account.session.epoch],
    enabled, staleTime: 0, gcTime: 0, refetchOnMount: 'always', placeholderData: undefined,
    queryFn: async () => { account.guard(); const rows = await fetchFriendIds(profileId!); account.guard(); return rows; },
  });
  return { ...result, data: enabled && result.isFetchedAfterMount && !result.isError && !result.isPlaceholderData ? result.data ?? EMPTY_FRIEND_IDS : EMPTY_FRIEND_IDS };
}

export function useLiveFriends(friendIds: string[]) {
  const account = useProfileAccount();
  const qc = useQueryClient();
  const profileId = account.profile?.id;
  const key = useMemo(() => ['vybemap-live-friends', profileId, account.session.uid, account.session.epoch, [...friendIds].sort().join(':')],
    [profileId, account.session.uid, account.session.epoch, friendIds]);
  const enabled = account.ready && !!profileId && friendIds.length > 0;
  const [listenerError, setListenerError] = useState<{ key: string; error: Error } | null>(null);
  const keyText = JSON.stringify(key);
  const query = useQuery({
    queryKey: key, enabled, staleTime: 0, gcTime: 0, refetchOnMount: 'always', placeholderData: undefined,
    refetchInterval: 12_000, refetchOnWindowFocus: 'always', retry: false,
    queryFn: async () => {
      account.guard();
      const result = await fetchLiveFriends(profileId!, friendIds, account.guard);
      account.guard();
      setListenerError(null);
      return result;
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const guard = account.guard;
    let active = true;
    const stop = subscribeLiveFriends(profileId!, () => {
      try { guard(); } catch { return; }
      if (!active) return;
      void qc.invalidateQueries({ queryKey: key });
    }, error => {
      try { guard(); } catch { return; }
      if (active) setListenerError({ key: keyText, error });
    });
    return () => { active = false; stop(); };
  // A subscription belongs to this exact immutable account/friend scope.
  }, [enabled, keyText, qc]);
  const error = listenerError?.key === keyText ? listenerError.error : query.error;
  const smoothed = useMemo(() => enabled && query.isFetchedAfterMount && !error && !query.isPlaceholderData
    ? applyDisplayPositions(query.data ?? EMPTY_LIVE_FRIENDS, 1) : EMPTY_LIVE_FRIENDS,
  [enabled, query.isFetchedAfterMount, error, query.isPlaceholderData, query.data]);
  return { ...query, data: smoothed, error, isError: !!error, isLoading: enabled && query.isPending };
}

export function useMapStories(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-stories'], enabled, staleTime: 30_000, queryFn: fetchMapStories });
}

export function useMapPosts(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-posts'], enabled, staleTime: 30_000, queryFn: fetchMapPosts });
}

export function useMapClips(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-clips'], enabled, staleTime: 30_000, queryFn: fetchMapClips });
}

export function useMapMeetups(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-meetups'], enabled, staleTime: 15_000, queryFn: fetchMapMeetups });
}

export function useMapHeatmap(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-heatmap'], enabled, staleTime: 60_000, queryFn: fetchHeatmap });
}

export function useMapPlaces(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-places'], enabled, staleTime: 120_000, queryFn: fetchMapPlaces });
}

export function useMapEventPins(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-event-pins'], enabled, staleTime: 60_000, queryFn: fetchEventPins });
}

export function useLocationHistory(userId?: string, mode: TimeMachineMode = 'now') {
  return useQuery({
    queryKey: ['vybemap-history', userId, mode],
    enabled: !!userId && mode !== 'now',
    queryFn: async () => {
      const now = Date.now();
      const since = mode === '1h' ? now - 3_600_000
        : mode === '6h' ? now - 6 * 3_600_000
        : mode === 'yesterday' ? now - 86_400_000
        : now - 7 * 86_400_000;
      return fetchLocationHistory(userId!, since);
    },
  });
}

export function useCreateMeetup() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createMeetup>[1]) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createMeetup(profile.id, input);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vybemap-meetups'] }),
  });
}

export function useCheckIn() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      latitude: number;
      longitude: number;
      message?: string;
      placeId?: string;
      placeName?: string;
    }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createCheckIn(
        profile.id,
        input.latitude,
        input.longitude,
        input.message,
        input.placeId,
        input.placeName,
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vybemap-places'] });
      void qc.invalidateQueries({ queryKey: ['vybemap-friend-checkins'] });
    },
  });
}

export function useCreateMapSpot() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      category: string;
      description?: string;
      photo_url?: string;
      latitude: number;
      longitude: number;
      vibe_tags?: string[];
    }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createMapSpot(profile.id, input);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vybemap-places'] });
      void qc.invalidateQueries({ queryKey: ['vybemap-heatmap'] });
    },
  });
}

export function useStartFindFriend() {
  const { profile } = useAuth();
  return useMutation({
    mutationFn: (targetId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return startFinderSession(profile.id, targetId);
    },
  });
}

export function useFriendRadar(friends: LiveFriend[], myCoords: [number, number] | null) {
  return useMemo(() => {
    if (!myCoords) return { count: 0, label: '' };
    const nearby = friends.filter((f) => {
      const lat = f.displayLat ?? f.latitude;
      const lng = f.displayLng ?? f.longitude;
      if (!isValidLatLng(lat, lng)) return false;
      const d = Math.hypot((lat - myCoords[0]) * 111_000, (lng - myCoords[1]) * 85_000);
      return d < 2000;
    });
    return {
      count: nearby.length,
      label: nearby.length ? `${nearby.length} friend${nearby.length > 1 ? 's' : ''} nearby` : '',
    };
  }, [friends, myCoords]);
}

export function useLogLocationAccess() {
  const { profile } = useAuth();
  return useCallback(async (targetId: string, action: string) => {
    if (!profile?.id || profile.id === targetId) return;
    await logLocationAccess(profile.id, targetId, action);
  }, [profile?.id]);
}

export function usePlacePosts(placeId?: string) {
  return useQuery({
    queryKey: ['vybemap-place-posts', placeId],
    enabled: !!placeId,
    staleTime: 15_000,
    queryFn: () => fetchPlacePosts(placeId!),
  });
}

export function useCreatePlacePost() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { placeId: string; content: string; mediaUrl?: string }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createPlacePost(profile.id, input.placeId, input.content, input.mediaUrl);
    },
    onSuccess: (_id, { placeId }) => {
      void qc.invalidateQueries({ queryKey: ['vybemap-place-posts', placeId] });
      void qc.invalidateQueries({ queryKey: ['vybemap-places'] });
    },
  });
}

export function useFriendCheckIns(friendIds: string[]) {
  return useQuery({
    queryKey: ['vybemap-friend-checkins', [...friendIds].sort().join(':')],
    enabled: friendIds.length > 0,
    staleTime: 20_000,
    refetchInterval: 30_000,
    queryFn: () => fetchFriendCheckIns(friendIds),
  });
}

export function useMyMeetupMemberships(profileId?: string) {
  return useQuery({
    queryKey: ['vybemap-meetup-memberships', profileId],
    enabled: !!profileId,
    staleTime: 30_000,
    queryFn: () => fetchMyMeetupMemberships(profileId!),
  });
}

export function useJoinMeetup() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetupId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return joinMeetup(profile.id, meetupId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vybemap-meetups'] });
      void qc.invalidateQueries({ queryKey: ['vybemap-meetup-memberships'] });
    },
  });
}

export function useLeaveMeetup() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (meetupId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return leaveMeetup(profile.id, meetupId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['vybemap-meetups'] });
      void qc.invalidateQueries({ queryKey: ['vybemap-meetup-memberships'] });
    },
  });
}

export function usePlacePostComments(postId?: string) {
  return useQuery({
    queryKey: ['vybemap-place-comments', postId],
    enabled: !!postId,
    staleTime: 10_000,
    queryFn: () => fetchPlacePostComments(postId!),
  });
}

export function useCreatePlacePostComment() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { postId: string; content: string; placeId: string }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createPlacePostComment(profile.id, input.postId, input.content);
    },
    onSuccess: (_id, { postId, placeId }) => {
      void qc.invalidateQueries({ queryKey: ['vybemap-place-comments', postId] });
      void qc.invalidateQueries({ queryKey: ['vybemap-place-posts', placeId] });
    },
  });
}

export function useGroupMaps(profileId?: string) {
  return useQuery({
    queryKey: ['vybemap-group-maps', profileId],
    enabled: !!profileId,
    staleTime: 30_000,
    queryFn: () => fetchMyGroupMaps(profileId!),
  });
}

export function useCreateGroupMap() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; emoji?: string }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createGroupMap(profile.id, input);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vybemap-group-maps'] }),
  });
}

export function useJoinGroupMap() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return joinGroupMap(profile.id, groupId);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vybemap-group-maps'] }),
  });
}

export function useGroupMemberIds(groupId?: string) {
  return useQuery({
    queryKey: ['vybemap-group-members', groupId],
    enabled: !!groupId,
    staleTime: 20_000,
    queryFn: () => fetchGroupMemberIds(groupId!),
  });
}
