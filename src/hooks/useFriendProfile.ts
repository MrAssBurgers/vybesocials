import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useProfileByUsername } from '@/hooks/useProfile';
import { useFriendshipStatus } from '@/hooks/useFriends';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { resolveProfileVisibility, refreshFriendshipPairStats } from '@/lib/friendProfileClient';
import { useFriendProfileRealtime } from '@/hooks/useFriendProfileRealtime';
import { db } from '@/lib/firebase';

export function useFriendProfile(username: string | undefined) {
  const profileId = useAuthProfileId();
  const profileQuery = useProfileByUsername(username!);
  const targetId = profileQuery.data?.id;
  const friendshipQuery = useFriendshipStatus(targetId);
  const blockedQuery = useQuery({
    queryKey: ['profile-blocked-pair', profileId, targetId],
    queryFn: async () => {
      if (!profileId || !targetId || profileId === targetId) return false;
      const { data, error } = await db
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(
          `and(blocker_id.eq.${profileId},blocked_id.eq.${targetId}),and(blocker_id.eq.${targetId},blocked_id.eq.${profileId})`,
        )
        .limit(1);
      if (error) throw error;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!profileId && !!targetId,
    staleTime: 30_000,
  });

  const visibilityQuery = useQuery({
    queryKey: ['profile-visibility-resolved', profileId, targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const { data, error } = await resolveProfileVisibility(targetId);
      if (error) throw error;
      return data?.fields ?? null;
    },
    enabled: !!profileId && !!targetId,
    staleTime: 60_000,
  });

  useFriendProfileRealtime(targetId);

  const status = friendshipQuery.data?.status ?? 'none';

  useEffect(() => {
    if (status === 'friends' && targetId) {
      void refreshFriendshipPairStats(targetId);
    }
  }, [status, targetId]);

  return {
    profile: profileQuery.data,
    profilePending: profileQuery.isPending,
    profileError: profileQuery.isError,
    refetchProfile: profileQuery.refetch,
    friendshipStatus: status,
    isFriend: status === 'friends',
    isPendingRequest: status === 'pending_sent' || status === 'pending_received',
    isSelf: !!profileId && profileId === targetId,
    isBlocked: status === 'blocked' || blockedQuery.data === true,
    relationshipPending: friendshipQuery.isPending || blockedQuery.isPending,
    relationshipError: friendshipQuery.isError || blockedQuery.isError,
    visibility: visibilityQuery.data,
    visibilityPending: visibilityQuery.isPending,
    visibilityError: visibilityQuery.isError,
  };
}
