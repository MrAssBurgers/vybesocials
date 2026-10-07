import { describe, expect, it } from 'vitest';
import { buildPostShareUrl, buildProfileShareUrl } from './shareLinks';

describe('share links', () => {
  it('shares a profile as a vybehub.app address', () => {
    expect(buildProfileShareUrl('blaze')).toBe('https://vybehub.app/u/blaze');
    expect(buildProfileShareUrl('  @blaze ')).toBe('https://vybehub.app/u/blaze');
    expect(buildProfileShareUrl('a b')).toBe('https://vybehub.app/u/a%20b');
  });

  it('shares a post as a vybehub.app address', () => {
    expect(buildPostShareUrl('post-1')).toBe('https://vybehub.app/p/post-1');
  });
});
