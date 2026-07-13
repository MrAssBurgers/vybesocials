import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/profileCache', () => ({
  getCachedProfile: vi.fn(),
  getCachedCurrentProfile: vi.fn(),
}));

import { getCachedCurrentProfile, getCachedProfile } from '@/lib/profileCache';
import {
  cacheProfileAvatar,
  clearProfileAvatarMemoryCache,
  getCachedProfileAvatar,
  resolveProfileAvatarUrl,
} from '@/lib/profileAvatarCache';

describe('resolveProfileAvatarUrl', () => {
  beforeEach(() => {
    vi.mocked(getCachedProfile).mockReturnValue(null);
    vi.mocked(getCachedCurrentProfile).mockReturnValue(null);
    localStorage.clear();
    clearProfileAvatarMemoryCache();
  });

  it('prefers an explicit avatar url', () => {
    expect(resolveProfileAvatarUrl('user-a', 'https://cdn/a.jpg')).toBe('https://cdn/a.jpg');
  });

  it('never returns the current user avatar when profileId is missing', () => {
    vi.mocked(getCachedCurrentProfile).mockReturnValue({
      id: 'me',
      username: 'me',
      display_name: null,
      avatar_url: 'https://cdn/me.jpg',
    });

    expect(resolveProfileAvatarUrl(undefined, null)).toBeNull();
    expect(resolveProfileAvatarUrl(null, undefined)).toBeNull();
  });

  it('only uses the current user avatar when ids match', () => {
    vi.mocked(getCachedCurrentProfile).mockReturnValue({
      id: 'me',
      username: 'me',
      display_name: null,
      avatar_url: 'https://cdn/me.jpg',
    });

    expect(resolveProfileAvatarUrl('me', null)).toBe('https://cdn/me.jpg');
    expect(resolveProfileAvatarUrl('someone-else', null)).toBeNull();
  });

  it('reads from profile cache and avatar disk cache', () => {
    vi.mocked(getCachedProfile).mockReturnValue({
      id: 'bob',
      username: 'bob',
      display_name: null,
      avatar_url: 'https://cdn/bob-cache.jpg',
    });

    expect(resolveProfileAvatarUrl('bob', null)).toBe('https://cdn/bob-cache.jpg');

    cacheProfileAvatar('carol', 'https://cdn/carol-disk.jpg');
    expect(getCachedProfileAvatar('carol')).toBe('https://cdn/carol-disk.jpg');
    expect(resolveProfileAvatarUrl('carol', null)).toBe('https://cdn/carol-disk.jpg');
  });
});
