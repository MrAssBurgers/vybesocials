import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useInfinitePosts, useInfiniteFollowingPosts, usePersonalizedFeed } from './useInfinitePosts';

const state = vi.hoisted(() => ({
  rpc: vi.fn(), profile: { id: 'viewer' } as { id: string } | null,
  blocked: [] as string[], media: vi.fn(), authority: vi.fn(),
}));
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: (options: unknown) => options, useQueryClient: () => ({}) }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: state.rpc } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: state.profile, user: { id: 'auth-viewer' } }) }));
vi.mock('@/hooks/useSocialFeed', () => ({ useSocialFeed: (...args: unknown[]) => state.authority(...args) }));
vi.mock('@/hooks/useBlockedUsers', () => ({ useBlockedUserIds: () => state.blocked }));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: (query: unknown) => query }));
vi.mock('@/lib/profileCache', () => ({ getEffectiveProfileId: (id?: string) => id ?? null }));
vi.mock('@/lib/signedUrlCache', () => ({ ensureMediaUrlsReady: state.media }));
vi.mock('@/lib/imagePreload', () => ({ preloadFeedPostsMedia: vi.fn() }));

type Query = { queryFn: (context: { pageParam: number }) => Promise<{ posts: { id: string; tags: string[] }[]; nextPage: number | null }>; enabled: boolean };
function config(hook: () => unknown): Query { return renderHook(hook).result.current as Query; }
function rows(count = 15) { return Array.from({ length: count }, (_, i) => ({ id: `post-${i}`, author_id: `author-${i}`, author_username: `creator${i}`, type: 'short', media_url: 'https://example.invalid/clip.mp4', tags: [] })); }
beforeEach(() => {
  state.authority.mockReset().mockImplementation((_type, enabled) => ({ enabled }));
  state.rpc.mockReset(); state.media.mockReset().mockResolvedValue(undefined);
  state.profile = { id: 'viewer' }; state.blocked = [];
});
afterEach(cleanup);

describe('feed hook contracts', () => {
  it('routes personalized and Following callers exclusively through audience admission', () => {
    config(() => usePersonalizedFeed('short'));
    expect(state.authority).toHaveBeenLastCalledWith('short', true, 'personalized');
    config(() => useInfiniteFollowingPosts('video', { enabled: false }));
    expect(state.authority).toHaveBeenLastCalledWith('video', false, 'following');
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('rejects a failed global read instead of caching an empty success', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'Denied', name: 'permission-denied' } });
    await expect(config(() => useInfinitePosts()).queryFn({ pageParam: 0 })).rejects.toMatchObject({ message: 'Denied', code: 'permission-denied' });
  });



  it('continues global pagination after blocked rows are removed', async () => {
    state.blocked = ['author-0']; state.rpc.mockResolvedValue({ data: rows(), error: null });
    const page = await config(() => useInfinitePosts()).queryFn({ pageParam: 0 });
    expect(page.posts).toHaveLength(14); expect(page.nextPage).toBe(1);
  });



  it('normalizes malformed tags before rendering filters', async () => {
    state.rpc.mockResolvedValue({ data: [{ ...rows(1)[0], tags: 'not-an-array' }, { ...rows(1)[0], id: 'mixed', tags: ['music', null, 42] }], error: null });
    const page = await config(() => useInfinitePosts()).queryFn({ pageParam: 0 });
    expect(page.posts.map(post => post.tags)).toEqual([[], ['music']]);
  });
  it('preserves explicit inactive-tab query gating', () => {
    expect(config(() => useInfinitePosts(undefined, undefined, { enabled: false })).enabled).toBe(false);
    expect(config(() => usePersonalizedFeed(undefined, { enabled: false })).enabled).toBe(false);
  });
  it('keeps received posts usable if speculative media warmup fails', async () => {
    state.media.mockRejectedValue(new Error('Media offline')); state.rpc.mockResolvedValue({ data: rows(1), error: null });
    const page = await config(() => useInfinitePosts()).queryFn({ pageParam: 0 });
    await Promise.resolve(); expect(page.posts).toHaveLength(1);
  });
});
