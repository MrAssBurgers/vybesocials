import { describe, expect, it } from 'vitest';
import { profileUsernameCandidates } from './profileUsername';

describe('profile username candidates', () => {
  it('tries the typed handle, lowercase, and a capital first letter', () => {
    expect(profileUsernameCandidates('  @Blaze ')).toEqual(['Blaze', 'blaze']);
    expect(profileUsernameCandidates('blaze')).toEqual(['blaze', 'Blaze']);
  });

  it('does not search a slash', () => {
    expect(profileUsernameCandidates('a/b')).toEqual([]);
  });
});
