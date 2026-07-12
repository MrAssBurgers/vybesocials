import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfileByUsername } from '@/hooks/useProfile';
import { useFriendshipStatus } from '@/hooks/useFriends';
import { useBlockedUserIds } from '@/hooks/useBlockedUsers';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { resolveProfileVisibility, refreshFriendshipPairStats } from '@/lib/friendProfileClient';
import { publicProfilePath } from '@/lib/friendProfileRoutes';
import { useFriendProfileRealtime } from '@/hooks/useFriendProfileRealtime';

export function useFriendProfile(username: string | undefined) {
  const navigate = useNavigate();
  const profileId = useAuthProfileId();
  const profileQuery = useProfileByUsername(username!);
  const targetId = profileQuery.data?.id;
  const friendshipQuery = useFriendshipStatus(targetId);
  const blockedIds = useBlockedUserIds();

  const isBlocked = !!targetId && blockedIds.includes(targetId);

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
  const isFriend =
    status === 'friends' ||
    status === 'pending_sent' ||
    status === 'pending_received';

  useEffect(() => {
    if (!username || profileQuery.isPending || !targetId) return;
    if (profileId === targetId) {
      navigate('/profile', { replace: true });
      return;
    }
    if (!isFriend && status === 'none') {
      navigate(publicProfilePath(username), { replace: true });
    }
  }, [
    username,
    targetId,
    profileId,
    isFriend,
    status,
    profileQuery.isPending,
    navigate,
  ]);

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
    isBlocked,
    visibility: visibilityQuery.data,
    visibilityPending: visibilityQuery.isPending,
  };
}
