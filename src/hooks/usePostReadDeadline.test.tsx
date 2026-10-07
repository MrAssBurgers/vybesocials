import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), counts: vi.fn() }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => ({ user: { id: 'alice' }, profile: { id: 'profile-alice' }, session: { uid: 'alice', epoch: 1 }, ready: true, guard: () => {} }) }));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: (value: unknown) => value }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/commentService', () => ({ readCommentCounts: (...args: unknown[]) => state.counts(...args) }));
import { useSocialFeed } from './useSocialFeed';
import { useSocialPostList } from './useSocialPostList';
import { useVisiblePostCount } from './useVisiblePostCount';
const clients: QueryClient[] = [];
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
const row = (id = 'current-post') => ({ id, type: 'post', caption: 'Checked content', createdAt: '2026-10-04T12:00:00.000Z', publicationRevision: 'a'.repeat(48), needsOwnerConfirmation: false,
  mediaUrl: null, mediaUrls: [], thumbnailUrl: null, ageRating: 'safe', tags: [], likeCount: 0, commentCount: 0, viewCount: 0,
  isPinned: false, isBookmarked: false, reactionType: null, author: { id: 'profile-bob', username: 'bob', displayName: null, avatarUrl: null } });
function receipt(name: string, input: Record<string, unknown>, id = 'current-post') {
  return { data: { ownerUid: 'alice', viewerProfileId: 'profile-alice', posts: [row(id)], nextCursor: null,
    ...(name === 'readSocialFeed' ? { contentType: null, feed: 'discover' } : {
      selection: { scope: 'profile', targetId: 'bob', search: null, since: null, contentType: null }, unavailableSavedPostIds: [],
    }), ...('cursor' in input ? { nextCursor: null } : {}) } };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
const tick = async (ms = 5) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed'));
  state.invoke.mockReset().mockImplementation(async (name, input) => receipt(name, input));
  state.counts.mockReset().mockImplementation(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, 0])));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); vi.restoreAllMocks(); });
describe.each(['feed', 'profile', 'count'] as const)('%s whole post read deadline', surface => {
  const useReader = surface === 'feed' ? () => useSocialFeed() : surface === 'profile' ? () => useSocialPostList({ scope: 'profile', targetId: 'bob' }) : () => useVisiblePostCount('bob');
  it('releases stalled initial loading, permits retry, and retires the separately delivered old response', async () => {
    const pending = deferred<unknown>(); state.invoke.mockImplementationOnce(() => pending.promise);
    const hook = renderHook(useReader, { wrapper: wrapper() }); await tick();
    expect(state.invoke).toHaveBeenCalledOnce(); await tick(15001);
    expect(hook.result.current.isError).toBe(true);
    if ('isFetching' in hook.result.current) expect(hook.result.current.isFetching).toBe(false);
    act(() => { if ('refetch' in hook.result.current) void hook.result.current.refetch(); else void hook.result.current.retry(); });
    await tick(); expect(hook.result.current.isError).toBe(false);
    const before = 'data' in hook.result.current ? hook.result.current.data : hook.result.current.count;
    const oldCall = state.invoke.mock.calls[0];
    await act(async () => { pending.resolve(receipt(oldCall[0], oldCall[1], 'retired-post')); await vi.advanceTimersByTimeAsync(5); });
    expect('data' in hook.result.current ? hook.result.current.data : hook.result.current.count).toEqual(before);
    expect(state.invoke).toHaveBeenCalledTimes(2);
    expect(state.counts).not.toHaveBeenCalled();
  });
});
it('paints a profile list from the admitted page without a second comment-count request', async () => {
  const transport = deferred<unknown>();
  state.invoke.mockImplementationOnce(() => transport.promise);
  const hook = renderHook(() => useSocialPostList({ scope: 'profile', targetId: 'bob' }), { wrapper: wrapper() });
  await act(async () => { transport.resolve(receipt('readSocialPostList', {})); await vi.advanceTimersByTimeAsync(5); });
  expect(state.counts).not.toHaveBeenCalled();
  expect(hook.result.current.isError).toBe(false);
  expect(hook.result.current.data?.[0].id).toBe('current-post');
  expect(hook.result.current.data?.[0].comment_count).toBe(0);
});
