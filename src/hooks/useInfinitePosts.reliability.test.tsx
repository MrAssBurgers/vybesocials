import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
const state = vi.hoisted(() => ({ feed: vi.fn(), list: vi.fn() }));
vi.mock('./useSocialFeed', () => ({ useSocialFeed: (...args: unknown[]) => state.feed(...args) }));
vi.mock('./useSocialPostList', () => ({ useSocialPostList: (...args: unknown[]) => state.list(...args) }));
import { useInfinitePosts, useInfiniteFollowingPosts, usePersonalizedFeed } from './useInfinitePosts';
beforeEach(() => { state.feed.mockReset().mockReturnValue({ data: undefined }); state.list.mockReset().mockReturnValue({ data: undefined }); });
describe('legacy feed hooks preserve checked reader boundaries', () => {
  it('routes global, personalized and following to current admission', () => {
    renderHook(() => useInfinitePosts('video')); expect(state.feed).toHaveBeenLastCalledWith('video', true);
    renderHook(() => usePersonalizedFeed('short')); expect(state.feed).toHaveBeenLastCalledWith('short', true, 'personalized');
    renderHook(() => useInfiniteFollowingPosts('post', { enabled: false })); expect(state.feed).toHaveBeenLastCalledWith('post', false, 'following');
  });
  it('retains profile paging controls while flattening only admitted data', () => {
    const fetchNextPage = vi.fn(); state.list.mockReturnValue({ data: [{ id: 'visible' }], hasNextPage: true, fetchNextPage });
    const result = renderHook(() => useInfinitePosts('post', 'profile-bob')).result.current;
    expect(state.list).toHaveBeenLastCalledWith({ scope: 'profile', targetId: 'profile-bob', contentType: 'post' }, true);
    expect(state.feed).toHaveBeenLastCalledWith('post', false);
    expect(result.data?.pages[0].posts).toEqual([{ id: 'visible' }]); expect(result.fetchNextPage).toBe(fetchNextPage);
  });
  it('preserves explicit inactive gating and no stale profile result', () => {
    const result = renderHook(() => useInfinitePosts(undefined, 'profile-bob', { enabled: false })).result.current;
    expect(state.list).toHaveBeenLastCalledWith({ scope: 'profile', targetId: 'profile-bob' }, false); expect(result.data).toBeUndefined();
  });
});
