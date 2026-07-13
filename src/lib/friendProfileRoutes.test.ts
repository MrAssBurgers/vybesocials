import { describe, expect, it } from 'vitest';
import {
  friendProfilePath,
  profilePathForFriendship,
  publicProfilePath,
} from '@/lib/friendProfileRoutes';

describe('friendProfileRoutes', () => {
  it('routes friends to the canonical /u/ route', () => {
    expect(profilePathForFriendship('alice', 'friends')).toBe('/u/alice');
    expect(profilePathForFriendship('bob', 'pending_received')).toBe('/u/bob');
  });

  it('routes strangers to /u/', () => {
    expect(profilePathForFriendship('carol', 'none')).toBe('/u/carol');
    expect(profilePathForFriendship('dave', 'blocked')).toBe('/u/dave');
  });

  it('encodes usernames in paths', () => {
    expect(friendProfilePath('a b')).toBe('/friend/a%20b');
    expect(publicProfilePath('x/y')).toBe('/u/x%2Fy');
  });
});
