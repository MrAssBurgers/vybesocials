import { describe, expect, it, vi } from 'vitest';
import {
  openFriendProfile,
  profilePathForFriendship,
  publicProfilePath,
  type FriendshipRouteStatus,
} from '@/lib/friendProfileRoutes';

describe('canonical relationship profile routes', () => {
  it.each<FriendshipRouteStatus>([
    'none',
    'friends',
    'pending_sent',
    'pending_received',
    'blocked',
  ])('uses /u/:username for %s', (status) => {
    expect(profilePathForFriendship('a user', status)).toBe('/u/a%20user');
  });

  it('opens the canonical route regardless of supplied relationship state', () => {
    const navigate = vi.fn();
    openFriendProfile(navigate, {
      username: 'friend/name',
      friendshipStatus: 'friends',
    });
    expect(navigate).toHaveBeenCalledWith(publicProfilePath('friend/name'));
  });
});
