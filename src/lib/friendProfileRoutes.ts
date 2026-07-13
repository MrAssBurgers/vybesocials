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

/** Every relationship state uses the canonical username route. */
export function profilePathForFriendship(
  username: string,
  _status: FriendshipRouteStatus,
): string {
  return publicProfilePath(username);
}

export function openFriendProfile(
  navigate: NavigateFunction,
  opts: {
    username: string;
    friendshipStatus?: FriendshipRouteStatus;
  },
): void {
  const status = opts.friendshipStatus ?? 'none';
  navigate(profilePathForFriendship(opts.username, status));
}
