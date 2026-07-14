import { describe, expect, it } from 'vitest';
import { publicProfilePath, profilePathForFriendship } from '@/lib/friendProfileRoutes';

describe('profile canonical routes', () => {
  it('uses /u/:username for every friendship state', () => {
    expect(publicProfilePath('alice')).toBe('/u/alice');
    expect(profilePathForFriendship('bob', 'none')).toBe('/u/bob');
    expect(profilePathForFriendship('bob', 'friends')).toBe('/u/bob');
    expect(profilePathForFriendship('bob', 'pending_sent')).toBe('/u/bob');
    expect(profilePathForFriendship('bob', 'blocked')).toBe('/u/bob');
  });

  it('encodes usernames safely', () => {
    expect(publicProfilePath('cool user')).toBe('/u/cool%20user');
  });
});
