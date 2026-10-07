import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  session: { uid: 'alice' as string | undefined, epoch: 3 },
  existing: undefined as unknown,
  written: [] as unknown[],
  list: vi.fn(),
}));

vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/admittedReadCache', () => ({
  readAdmittedPage: () => state.existing,
  writeAdmittedPage: (...args: unknown[]) => { state.written.push(args); },
}));
vi.mock('@/lib/socialPostListService', () => ({ readSocialPostList: (...args: unknown[]) => state.list(...args) }));

import { socialPostListCacheKey } from './socialPostListCacheKey';
import { warmOwnProfilePosts } from './warmOwnProfilePosts';

describe('own profile post warm', () => {
  beforeEach(() => {
    state.session = { uid: 'alice', epoch: 3 };
    state.existing = undefined;
    state.written = [];
    state.list.mockReset();
  });

  it('uses the same admitted key as the profile grid', () => {
    expect(socialPostListCacheKey('alice', 3, 'profile-alice', { scope: 'profile', targetId: 'profile-alice' }))
      .toBe(JSON.stringify(['social-post-list', 'alice', 3, 'profile-alice', { scope: 'profile', targetId: 'profile-alice' }, undefined]));
  });

  it('stores the callable page before the profile screen opens', async () => {
    const page = { posts: [], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30_000 };
    state.list.mockImplementation(async (_input: unknown, guard: () => void) => { guard(); return page; });
    warmOwnProfilePosts('alice', 'profile-alice');
    await vi.waitFor(() => expect(state.written).toHaveLength(1));
    expect(state.list).toHaveBeenCalledWith(
      { scope: 'profile', targetId: 'profile-alice', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice' },
      expect.any(Function),
      false,
    );
    expect(state.written[0]).toEqual([
      socialPostListCacheKey('alice', 3, 'profile-alice', { scope: 'profile', targetId: 'profile-alice' }),
      { pages: [page], pageParams: [undefined] },
      page.leaseUntil,
    ]);
  });

  it('does not read another account or repeat a live lease', () => {
    state.session = { uid: 'bob', epoch: 3 };
    warmOwnProfilePosts('alice', 'profile-alice');
    state.session = { uid: 'alice', epoch: 3 };
    state.existing = { data: { pages: [] } };
    warmOwnProfilePosts('alice', 'profile-alice');
    expect(state.list).not.toHaveBeenCalled();
  });
});
