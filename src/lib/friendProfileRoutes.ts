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

export function publicProfilePath(username: string, profileId?: string | null): string {
  const path = `/u/${encodeURIComponent(username)}`;
  const id = typeof profileId === 'string' ? profileId.trim() : '';
  if (!id || id === username || id.includes('/') || id.length > 128) return path;
  return `${path}?p=${encodeURIComponent(id)}`;
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
