import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), uid: 'alice', epoch: 1, ready: true }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch }, ready: state.ready,
    guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/socialFeedService', () => ({ readSocialFeed: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: (value: unknown) => value }));
import { useSocialFeed } from './useSocialFeed';
const clients: QueryClient[] = [];
const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous } } }); clients.push(client);
  return { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
};
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  window.dispatchEvent(new Event('app-resumed'));
  state.uid = 'alice'; state.epoch = 1; state.ready = true; state.read.mockReset();
  state.read.mockImplementation(async (_input, guard) => { guard(); return { posts: [{ id: 'alice-post' }], nextCursor: null, leaseUntil: Date.now() + 30000 }; });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
describe('visible current-account Global feed', () => {
  it('does not repaint the feed every second while its lease is still valid', async () => {
    let renders = 0;
    const hook = renderHook(() => { renders += 1; return useSocialFeed('post'); }, setup());
    await waitFor(() => expect(hook.result.current.data?.pages[0].posts).toEqual([{ id: 'alice-post' }]));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    const settled = renders;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); });
    expect(hook.result.current.data?.pages[0].posts).toEqual([{ id: 'alice-post' }]);
    expect(renders).toBe(settled);
  });
  it('can complete a checked feed after Strict Mode effect replay', async () => {
    const { wrapper: Wrapper } = setup();
    const hook = renderHook(() => useSocialFeed('post'), { wrapper: ({ children }) => <StrictMode><Wrapper>{children}</Wrapper></StrictMode> });
    await waitFor(() => expect(hook.result.current.data?.pages[0].posts).toEqual([{ id: 'alice-post' }]));
  });
  it('retires an in-flight feed on native pause and retries only after resume', async () => {
    let finish!: () => void;
    state.read.mockImplementationOnce(async (_input, guard) => {
      await new Promise<void>(resolve => { finish = resolve; }); guard();
      return { posts: [{ id: 'pre-pause' }], nextCursor: null, leaseUntil: Date.now() + 30000 };
    });
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await waitFor(() => expect(finish).toBeDefined());
    act(() => window.dispatchEvent(new Event('app-paused')));
    await act(async () => { finish(); });
    expect(hook.result.current.data).toBeUndefined();
    await act(async () => { await hook.result.current.refetch(); });
    expect(state.read).toHaveBeenCalledOnce();
    act(() => window.dispatchEvent(new Event('app-resumed')));
    await waitFor(() => expect(hook.result.current.data?.pages[0].posts).toEqual([{ id: 'alice-post' }]));
    expect(state.read).toHaveBeenCalledTimes(2);
  });
  it('does not start feed transport when mounted after the native app has paused', async () => {
    act(() => window.dispatchEvent(new Event('app-paused')));
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await act(async () => { await hook.result.current.refetch(); });
    expect(state.read).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('app-resumed')));
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    expect(state.read).toHaveBeenCalledOnce();
  });
  it('requires an area for Local and discards pages when that area changes', async () => {
    const hook = renderHook(({ area }: { area?: { lat: number; lng: number } }) => useSocialFeed(undefined, true, 'local', area), { ...setup(), initialProps: { area: undefined } });
    expect(state.read).not.toHaveBeenCalled();
    hook.rerender({ area: { lat: 41.9, lng: -87.6 } });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.read.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ area: { lat: 42, lng: -87.6 } });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.read).toHaveBeenLastCalledWith(expect.objectContaining({ feed: 'local', area: { lat: 42, lng: -87.6 } }), expect.any(Function)));
  });
  it('does not reuse discovery pages or cursors for a Following selection', async () => {
    const hook = renderHook(({ feed }: { feed: 'personalized' | 'following' }) => useSocialFeed('short', true, feed), { ...setup(), initialProps: { feed: 'personalized' as 'personalized' | 'following' } });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.read.mockImplementation(() => new Promise(() => {})); hook.rerender({ feed: 'following' });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.read).toHaveBeenLastCalledWith(expect.objectContaining({ feed: 'following', contentType: 'short' }), expect.any(Function)));
    expect(state.read.mock.calls.at(-1)![0].cursor).toBeUndefined();
  });
  it('waits for a canonical account and performs no disabled reads', async () => {
    state.ready = false; const hook = renderHook(() => useSocialFeed('post'), setup());
    expect(hook.result.current.data).toBeUndefined(); expect(state.read).not.toHaveBeenCalled();
    state.ready = true; hook.rerender(); await waitFor(() => expect(hook.result.current.data?.pages[0].posts).toHaveLength(1));
  });
  it('keeps an empty filtered page navigable using the opaque cursor', async () => {
    const cursor = 'a'.repeat(48);
    state.read.mockResolvedValueOnce({ posts: [], nextCursor: cursor, leaseUntil: Date.now() + 30000 }).mockResolvedValueOnce({ posts: [{ id: 'later' }], nextCursor: null, leaseUntil: Date.now() + 30000 });
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    await act(async () => { await hook.result.current.fetchNextPage(); });
    expect(state.read.mock.calls[1][0]).toMatchObject({ cursor, contentType: 'post', expectedOwnerUid: 'alice' });
    await waitFor(() => expect(hook.result.current.data?.pages[1]?.posts).toEqual([{ id: 'later' }]));
    expect(hook.result.current.hasNextPage).toBe(false);
  });
  it('clears stale content when refreshing current authority fails', async () => {
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.read.mockRejectedValue(new Error('Access unavailable'));
    await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.data).toBeUndefined();
  });
  it('hides posts while closed and requires a fresh read when reopened', async () => {
    const hook = renderHook(({ enabled }) => useSocialFeed('post', enabled), { ...setup(), initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    hook.rerender({ enabled: false }); expect(hook.result.current.data).toBeUndefined();
    state.read.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ enabled: true });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
  });
  it('rejects late results from a hidden document and rereads when visible', async () => {
    let finish!: () => void;
    state.read.mockImplementationOnce(async (_input, guard) => { await new Promise<void>(resolve => { finish = resolve; }); guard(); return { posts: [{ id: 'private' }], nextCursor: null, leaseUntil: Date.now() + 30000 }; });
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await waitFor(() => expect(finish).toBeDefined());
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { finish(); }); expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(hook.result.current.data?.pages[0].posts).toEqual([{ id: 'alice-post' }]));
  });
  it('never carries posts across account epochs', async () => {
    const hook = renderHook(() => useSocialFeed('post'), setup());
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.uid = 'bob'; state.epoch++; state.read.mockImplementation(() => new Promise(() => {})); hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
  });
});
