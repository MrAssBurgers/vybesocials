import { describe, expect, it } from 'vitest';
import { chooseProfileIdentity, profileUsernameCandidates } from './profileUsername';

describe('profile username candidates', () => {
  it('tries the typed handle, lowercase, and a capital first letter', () => {
    expect(profileUsernameCandidates('  @Blaze ')).toEqual(['Blaze', 'blaze']);
    expect(profileUsernameCandidates('blaze')).toEqual(['blaze', 'Blaze']);
  });

  it('does not search a slash', () => {
    expect(profileUsernameCandidates('a/b')).toEqual([]);
  });
});

describe('choose profile identity', () => {
  const live = { id: 'uid-live', user_id: 'uid-live', username: 'blaze' };
  const leftover = { id: 'legacy-uuid', user_id: 'other-uid', username: 'blaze' };

  it('opens the Auth-owned profile when an older duplicate shares the username', () => {
    expect(chooseProfileIdentity([leftover, live])?.id).toBe('uid-live');
  });

  it('opens the profile named by the click when that id is one of the duplicates', () => {
    expect(chooseProfileIdentity([live, leftover], 'legacy-uuid')?.id).toBe('legacy-uuid');
  });

  it('ignores a deleted duplicate and still opens the remaining profile', () => {
    expect(chooseProfileIdentity([{ ...live, deleted_at: '2020-01-01' }, leftover])?.id).toBe('legacy-uuid');
  });

  it('does not guess between two Auth-owned profiles', () => {
    expect(() => chooseProfileIdentity([live, { id: 'uid-other', user_id: 'uid-other', username: 'blaze' }])).toThrow(/identity review/);
  });
});
