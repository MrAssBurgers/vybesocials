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
  fetchMapStories,
  fetchMapPosts,
  fetchMapClips,
  fetchEventPins,
  logLocationAccess,
  startFinderSession,
  fetchLocationHistory,
} from '@/lib/vybemap/firestore';
import { useMapSocialList, useMapSocialMutation } from './useMapSocial';
import { useLocationSharing } from '@/hooks/useLocationSharing';
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

export function useLiveFriends(_friendIds: string[]) {
  const query = useLocationSharing();
  const data = useMemo(() => query.data?.locations.map(row => ({
    accessRevision: query.data.shares.find(share => share.id === row.shareId)?.revision,
    accessUntil: Math.min(query.data.validUntil, query.data.receivedAt + Date.parse(row.expiresAt) - query.data.serverTime),
    sampleExpiresAt: query.data.receivedAt + Date.parse(row.expiresAt) - query.data.serverTime,
    id: row.id, user_id: row.id, latitude: row.latitude, longitude: row.longitude,
    displayLat: row.latitude, displayLng: row.longitude, accuracy: row.accuracy,
    label: row.profile.displayName || row.profile.username, updated_at: row.updatedAt,
    expires_at: row.expiresAt, sharing_enabled: true, sharing_mode: row.precision,
    approx_radius_m: row.approxRadiusM, speed: row.speed, heading: row.heading,
    battery_percent: row.batteryPercent, activity_type: row.activityType,
    profile: { username: row.profile.username, display_name: row.profile.displayName, avatar_url: row.profile.avatarUrl },
  })) ?? EMPTY_LIVE_FRIENDS, [query.data]);
  return { ...query, data };
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

export function useMapMeetups(enabled: boolean) { return useMapSocialList('meetups', undefined, enabled); }

export function useMapHeatmap(enabled: boolean) {
  const query = useLocationSharing(undefined, enabled);
  const data = useMemo(() => {
    const cells = new Map<string, { geohash_prefix: string; cell_latitude: number; cell_longitude: number; intensity: number; pulse_level: number }>();
    for (const row of query.data?.locations || []) {
      // Only positions admitted to this viewer contribute; never raw global GPS.
      const lat = Math.round(row.latitude * 50) / 50, lng = Math.round(row.longitude * 50) / 50;
      const key = `${lat}:${lng}`, cell = cells.get(key);
      if (cell) cell.intensity++; else cells.set(key, { geohash_prefix: key, cell_latitude: lat, cell_longitude: lng, intensity: 1, pulse_level: 1 });
    }
    return [...cells.values()];
  }, [query.data]);
  return { ...query, data };
}

export function useMapPlaces(enabled: boolean) { return useMapSocialList('places', undefined, enabled); }

export function useMapEventPins(enabled: boolean) {
  return useQuery({ queryKey: ['vybemap-event-pins'], enabled, staleTime: 60_000, queryFn: fetchEventPins });
}

export function useLocationHistory(userId?: string, mode: TimeMachineMode = 'now') {
  const account = useProfileAccount();
  const enabled = account.ready && userId === account.profile?.id && mode !== 'now';
  const query = useQuery({
    queryKey: ['vybemap-history', userId, account.session.uid, account.session.epoch, mode],
    enabled, staleTime: 0, gcTime: 0, placeholderData: undefined, refetchOnMount: 'always', retry: false,
    queryFn: async () => {
      account.guard();
      const now = Date.now();
      const since = mode === '1h' ? now - 3_600_000 : mode === '6h' ? now - 6 * 3_600_000 : mode === 'yesterday' ? now - 86_400_000 : now - 7 * 86_400_000;
      const rows = await fetchLocationHistory(userId!, since); account.guard(); return rows;
    },
  });
  return { ...query, data: enabled && query.isFetchedAfterMount && !query.isError && !query.isPlaceholderData ? query.data : undefined };
}

export function useCreateMeetup() {
  const mutation = useMapSocialMutation('createMeetup');
  return { ...mutation, mutateAsync: (input: { title: string; description?: string; dest_latitude: number; dest_longitude: number; dest_label?: string }) => mutation.mutateAsync({ action: 'createMeetup', title: input.title, description: input.description, latitude: input.dest_latitude, longitude: input.dest_longitude, destLabel: input.dest_label }) };
}

export function useCheckIn() {
  const mutation = useMapSocialMutation('checkIn');
  return { ...mutation, mutateAsync: (input: { placeId: string; message?: string }) => mutation.mutateAsync({ action: 'checkIn', ...input }) };
}

export function useCreateMapSpot() {
  const mutation = useMapSocialMutation('createPlace');
  return { ...mutation, mutateAsync: (input: { name: string; category: string; description?: string; photo_url?: string; latitude: number; longitude: number; vibe_tags?: string[] }) => mutation.mutateAsync({ action: 'createPlace', name: input.name, category: input.category, description: input.description, photoUrl: input.photo_url, latitude: input.latitude, longitude: input.longitude }) };
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

export function usePlacePosts(placeId?: string) { return useMapSocialList('placePosts', placeId, !!placeId); }

export function useCreatePlacePost() {
  const mutation = useMapSocialMutation('createPlacePost');
  return { ...mutation, mutateAsync: (input: { placeId: string; content: string }) => mutation.mutateAsync({ action: 'createPlacePost', ...input }) };
}

export function useFriendCheckIns(_friendIds: string[]) { return useMapSocialList('checkIns'); }

export function useMyMeetupMemberships(_profileId?: string) {
  const query = useMapSocialList('meetups');
  return { ...query, data: query.data ? new Set(query.data.filter(row => row.membership?.status === 'going').map(row => row.id)) : undefined };
}

export function useJoinMeetup() {
  const mutation = useMapSocialMutation('joinMeetup');
  return { ...mutation, mutateAsync: (input: { meetupId: string; expectedRevision: string | null }) => mutation.mutateAsync({ action: 'joinMeetup', ...input }) };
}

export function useLeaveMeetup() {
  const mutation = useMapSocialMutation('leaveMeetup');
  return { ...mutation, mutateAsync: (input: { meetupId: string; expectedRevision: string | null }) => mutation.mutateAsync({ action: 'leaveMeetup', ...input }) };
}

export function usePlacePostComments(postId?: string) { return useMapSocialList('comments', postId, !!postId); }

export function useCreatePlacePostComment() {
  const mutation = useMapSocialMutation('createComment');
  return { ...mutation, mutateAsync: (input: { postId: string; content: string; placeId: string }) => mutation.mutateAsync({ action: 'createComment', postId: input.postId, content: input.content }) };
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
