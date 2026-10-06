import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ read: vi.fn(), uid: 'alice', epoch: 1 }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch }, ready: true,
    guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/socialFeedService', () => ({ readSocialFeed: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/lib/socialPostListService', () => ({ readSocialPostList: (...args: unknown[]) => state.read(...args) }));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: (value: unknown) => value }));
import { useSocialFeed } from './useSocialFeed';
import { useSocialPostList } from './useSocialPostList';
const clients: QueryClient[] = [];
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
const failure = (code = 'unavailable') => Object.assign(new Error('Temporary transport failure'), { code });
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  window.dispatchEvent(new Event('app-resumed')); state.uid = 'alice'; state.epoch = 1;
  state.read.mockReset().mockImplementation(async (_input, guard) => { guard(); return {
    posts: [{ id: 'checked-post' }], nextCursor: null, unavailableSavedPostIds: [], leaseUntil: Date.now() + 30000,
  }; });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });
describe.each(['feed', 'profile'] as const)('%s quick transport recovery', surface => {
  const useReader = surface === 'feed'
    ? function useFeedReader(target = 'bob', enabled = true) { return useSocialFeed('post', enabled, target === 'bob' ? 'discover' : 'following'); }
    : function useProfileReader(target = 'bob', enabled = true) { return useSocialPostList({ scope: 'profile', targetId: target }, enabled); };
  it.each(['unavailable', 'functions/unavailable', 'auth/network-request-failed'])('recovers %s without a manual refresh', async code => {
    state.read.mockRejectedValueOnce(failure(code));
    const hook = renderHook(() => useReader(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toBeDefined(), { timeout: 3000 });
    expect(state.read).toHaveBeenCalledTimes(2); expect(hook.result.current.isError).toBe(false);
  });
  it('stops after two retries and exposes the existing failure state', async () => {
    state.read.mockRejectedValue(failure());
    const hook = renderHook(() => useReader(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.isError).toBe(true), { timeout: 3000 });
    expect(state.read).toHaveBeenCalledTimes(3); expect(hook.result.current.data).toBeUndefined();
  });
  it.each(['permission-denied', 'failed-precondition', 'unauthenticated', 'deadline-exceeded', 'resource-exhausted', 'unknown'])('does not retry %s', async code => {
    state.read.mockRejectedValue(failure(code));
    const hook = renderHook(() => useReader(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(state.read).toHaveBeenCalledOnce(); expect(hook.result.current.data).toBeUndefined();
  });
  it('does not repeat a slow failed request', async () => {
    const originalNow = Date.now; let offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => originalNow() + offset);
    state.read.mockImplementation(async () => { offset = 4000; throw failure(); });
    const hook = renderHook(() => useReader(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(state.read).toHaveBeenCalledOnce();
  });
  it('stops pending retries when the reader closes', async () => {
    state.read.mockRejectedValue(failure());
    const hook = renderHook(({ enabled }) => useReader('bob', enabled), { wrapper: wrapper(), initialProps: { enabled: true } });
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    hook.rerender({ enabled: false });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    expect(state.read).toHaveBeenCalledOnce(); expect(hook.result.current.data).toBeUndefined();
  });
  it.each(['pause', 'account', 'selection', 'offline'] as const)('retires a scheduled retry on %s', async mode => {
    state.read.mockRejectedValueOnce(failure());
    const hook = renderHook(({ target }) => useReader(target), { wrapper: wrapper(), initialProps: { target: 'bob' } });
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    if (mode === 'pause') act(() => window.dispatchEvent(new Event('app-paused')));
    if (mode === 'offline') Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    if (mode === 'account') { state.uid = 'charlie'; state.epoch++; hook.rerender({ target: 'bob' }); }
    if (mode === 'selection') hook.rerender({ target: 'charlie' });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    expect(state.read).toHaveBeenCalledTimes(mode === 'account' || mode === 'selection' ? 2 : 1);
    if (mode === 'account') expect(state.read.mock.calls[1][0].expectedOwnerUid).toBe('charlie');
    if (mode === 'pause' || mode === 'offline') expect(hook.result.current.data).toBeUndefined();
  });
  it('does not extend an old lease while a retry is pending', async () => {
    const originalNow = Date.now; let offset = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => originalNow() + offset);
    state.read.mockResolvedValueOnce({ posts: [{ id: 'checked-post' }], nextCursor: null, unavailableSavedPostIds: [], leaseUntil: Date.now() + 1000 });
    const hook = renderHook(() => useReader(), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.read.mockRejectedValue(failure());
    act(() => { void hook.result.current.refetch(); });
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
    offset = 2000; hook.rerender();
    expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isError).toBe(true);
  });
  it('retires late results after changing the selected feed or profile', async () => {
    let release: ((value: unknown) => void) | undefined;
    state.read.mockImplementationOnce((_input, guard) => new Promise(resolve => { release = value => { guard(); resolve(value); }; }));
    const hook = renderHook(({ target }) => useReader(target), { wrapper: wrapper(), initialProps: { target: 'bob' } });
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    hook.rerender({ target: 'charlie' });
    await waitFor(() => expect(hook.result.current.data).toBeDefined());
    expect(() => release!({ posts: [{ id: 'retired' }] })).toThrow();
    expect(state.read).toHaveBeenCalledTimes(2);
  });
});
