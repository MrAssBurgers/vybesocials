import type { NavigateFunction } from 'react-router-dom';

export type FriendshipRouteStatus =
  | 'none'
  | 'friends'
  | 'pending_sent'
  | 'pending_received'
  | 'blocked';

export function friendProfilePath(username: string): string {
  return `/friend/${encodeURIComponent(username)}`;
}

export function publicProfilePath(username: string): string {
  return `/u/${encodeURIComponent(username)}`;
}

/** Friends and pending requests open the private friend profile route. */
export function profilePathForFriendship(
  username: string,
  status: FriendshipRouteStatus,
): string {
  if (
    status === 'friends' ||
    status === 'pending_sent' ||
    status === 'pending_received'
  ) {
    return friendProfilePath(username);
  }
  return publicProfilePath(username);
}

export function openFriendProfile(
  navigate: NavigateFunction,
  opts: {
    username: string;
    friendshipStatus?: FriendshipRouteStatus;
  },
): void {
  const status = opts.friendshipStatus ?? 'friends';
  navigate(profilePathForFriendship(opts.username, status));
}
