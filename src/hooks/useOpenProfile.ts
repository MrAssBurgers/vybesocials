import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  openFriendProfile,
  profilePathForFriendship,
  type FriendshipRouteStatus,
} from '@/lib/friendProfileRoutes';
import { useFriendshipStatus } from '@/hooks/useFriends';

/** Navigate to the canonical relationship-aware profile route. */
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

/** Navigate canonically while retaining the legacy status-shaped API. */
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
