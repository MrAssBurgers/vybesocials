import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { friendshipPairId } from '@/lib/friendProfilePair';
import {
  createLocationRequest,
  pauseLocationShare,
  stopLocationShare,
  type LocationDuration,
} from '@/lib/friendProfileClient';
import { toast } from 'sonner';

export interface LocationShareRow {
  id: string;
  pair_id: string;
  sharer_id: string;
  viewer_id: string;
  precision?: string;
  duration?: string;
  active?: boolean;
  paused?: boolean;
  expires_at?: string | null;
  last_latitude?: number | null;
  last_longitude?: number | null;
  last_accuracy?: number | null;
  last_activity_type?: string | null;
  last_battery_percent?: number | null;
  last_updated_at?: string | null;
}

export function useLocationShareWithFriend(otherProfileId: string | undefined) {
  const profileId = useAuthProfileId();
  const pairId =
    profileId && otherProfileId ? friendshipPairId(profileId, otherProfileId) : null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['location-share', pairId],
    queryFn: async (): Promise<LocationShareRow | null> => {
      if (!pairId) return null;
      const { data, error } = await db
        .from('location_shares')
        .select('*')
        .eq('id', pairId)
        .maybeSingle();
      if (error) throw error;
      return (data as LocationShareRow | null) ?? null;
    },
    enabled: !!pairId,
    staleTime: 15_000,
  });

  const requestShare = useMutation({
    mutationFn: async (opts: {
      duration?: LocationDuration;
      precision?: string;
      message?: string;
    }) => {
      if (!otherProfileId) throw new Error('Missing friend');
      const { data, error } = await createLocationRequest({
        targetId: otherProfileId,
        duration: opts.duration,
        precision: opts.precision,
        message: opts.message,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Location request sent');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not send request'),
  });

  const stopShare = useMutation({
    mutationFn: async () => {
      if (!otherProfileId) throw new Error('Missing friend');
      const { error } = await stopLocationShare(otherProfileId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['location-share', pairId] });
      toast.success('Location sharing stopped');
    },
  });

  const pauseShare = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!otherProfileId) throw new Error('Missing friend');
      const { error } = await pauseLocationShare(otherProfileId, paused);
      if (error) throw error;
    },
    onSuccess: (_, paused) => {
      queryClient.invalidateQueries({ queryKey: ['location-share', pairId] });
      toast.success(paused ? 'Location paused' : 'Location resumed');
    },
  });

  const share = query.data;
  const isSharer = !!profileId && share?.sharer_id === profileId;
  const isViewer = !!profileId && share?.viewer_id === profileId;
  const isActive = !!share?.active && !share?.paused;

  return {
    ...query,
    share,
    isSharer,
    isViewer,
    isActive,
    requestShare,
    stopShare,
    pauseShare,
  };
}
