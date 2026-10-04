import { describe, expect, it, vi } from 'vitest';
vi.mock('@/hooks/useFriendProfile', () => ({ useFriendProfile: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
import { mapProfilePermissions } from './useProfileViewModel';
import { DEFAULT_PERMISSIONS } from './types';
describe('profile permission mapping', () => {
  it.each([null, undefined])('has no permissive defaults without verified fields %s', value => {
    expect(mapProfilePermissions(value, false)).toEqual(DEFAULT_PERMISSIONS);
    expect(mapProfilePermissions(value, true)).toEqual(DEFAULT_PERMISSIONS);
  });
  it('maps only known fields and never invents non-owner aliases', () => {
    const result = mapProfilePermissions({ bio: true, level: true, activity: true, posts: false, score: true, age: true, birthday: true, friends_list: true, online: true }, false);
    expect(result).toMatchObject({ bio: true, level: true, online: true, posts: false, clips: false, stories: false, score: false, birthday: false, friends_list: false });
  });
  it('keeps malformed self settings denied for their corresponding section', () => {
    expect(mapProfilePermissions({ level: false, posts: false, stories: false }, true)).toMatchObject({ level: false, score: false, posts: false, stories: false, birthday: true, friends_list: true });
  });
});
