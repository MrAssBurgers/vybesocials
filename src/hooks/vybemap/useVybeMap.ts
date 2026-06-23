import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
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
  logLocationAccess,
  startFinderSession,
  createCheckIn,
  createMeetup,
  fetchLocationHistory,
} from '@/lib/vybemap/firestore';
import { applyDisplayPositions } from '@/lib/vybemap/smoothing';
import { isValidLatLng } from '@/lib/vybemap/geo';

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

export function useFriendIds(profileId?: string) {
  return useQuery({
    queryKey: ['vybemap-friend-ids', profileId],
    enabled: !!profileId,
    staleTime: 60_000,
    queryFn: () => fetchFriendIds(profileId!),
  });
}

export function useLiveFriends(friendIds: string[]) {
  const qc = useQueryClient();
  const smoothRef = useRef(0);
  const [smoothT, setSmoothT] = useState(1);
  const friendSet = useMemo(() => new Set(friendIds), [friendIds]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      smoothRef.current = Math.min(1, smoothRef.current + 0.08);
      setSmoothT(smoothRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!friendIds.length) return;
    const unsub = subscribeLiveFriends(friendSet, () => {
      smoothRef.current = 0;
      void qc.invalidateQueries({ queryKey: ['vybemap-live-friends'] });
    });
    return unsub;
  }, [friendIds, friendSet, qc]);

  const query = useQuery({
    queryKey: ['vybemap-live-friends', [...friendIds].sort().join(':')],
    enabled: friendIds.length > 0,
    staleTime: 3_000,
    refetchInterval: 8_000,
    queryFn: () => fetchLiveFriends(friendIds),
  });

  const smoothed = useMemo(
    () => applyDisplayPositions(query.data || [], smoothT),
    [query.data, smoothT],
  );

  return { ...query, data: smoothed };
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
    mutationFn: (input: { latitude: number; longitude: number; message?: string }) => {
      if (!profile?.id) throw new Error('Not signed in');
      return createCheckIn(profile.id, input.latitude, input.longitude, input.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['vybemap-places'] }),
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
