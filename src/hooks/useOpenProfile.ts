import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  openFriendProfile,
  profilePathForFriendship,
  type FriendshipRouteStatus,
} from '@/lib/friendProfileRoutes';
import { useFriendshipStatus } from '@/hooks/useFriends';

/** Navigate to the correct public or private profile route. */
export function useOpenProfile() {
  const navigate = useNavigate();

  return useCallback(
    (username: string, friendshipStatus?: FriendshipRouteStatus) => {
      openFriendProfile(navigate, {
        username,
        friendshipStatus: friendshipStatus ?? 'none',
      });
    },
    [navigate],
  );
}

/** Resolve friendship status then navigate — use when only userId is known. */
export function useOpenProfileByUserId() {
  const navigate = useNavigate();

  return useCallback(
    (username: string, userId: string, status?: FriendshipRouteStatus) => {
      if (status) {
        openFriendProfile(navigate, { username, friendshipStatus: status });
        return;
      }
      navigate(profilePathForFriendship(username, 'none'));
    },
    [navigate],
  );
}

/** Hook that returns a click handler with friendship-aware routing. */
export function useProfileNavigation(username: string | undefined, userId?: string) {
  const openProfile = useOpenProfile();
  const { data: friendship } = useFriendshipStatus(userId);

  const goToProfile = useCallback(() => {
    if (!username) return;
    openProfile(username, friendship?.status ?? 'none');
  }, [username, friendship?.status, openProfile]);

  const profilePath =
    username && friendship?.status
      ? profilePathForFriendship(username, friendship.status)
      : username
        ? profilePathForFriendship(username, 'none')
        : '/';

  return { goToProfile, profilePath, friendshipStatus: friendship?.status ?? 'none' as const };
}
