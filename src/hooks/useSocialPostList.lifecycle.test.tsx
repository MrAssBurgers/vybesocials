import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ list: vi.fn(), summary: vi.fn(), uid: 'alice', epoch: 1, ready: true }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch }, ready: state.ready,
    guard: () => { if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/socialPostListService', () => ({ readSocialPostList: (...args: unknown[]) => state.list(...args), readSocialPostSummary: (...args: unknown[]) => state.summary(...args) }));
import { useSocialPostList } from './useSocialPostList';
import { useVisiblePostCount } from './useVisiblePostCount';
import { usePostReadView } from './usePostReadView';
const clients: QueryClient[] = [];
const wrapper = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous } } }); clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); state.uid = 'alice'; state.epoch = 1; state.ready = true;
  state.list.mockReset().mockImplementation(async (_input, guard) => { guard(); return { posts: [{ id: 'visible' }], unavailableSavedPostIds: ['gone'], nextCursor: null, leaseUntil: Date.now() + 30000 }; });
  state.summary.mockReset().mockImplementation(async (_input, guard) => { guard(); return { count: 12, hasMore: false, tags: [], leaseUntil: Date.now() + 30000 }; });
});
afterEach(() => { vi.useRealTimers(); cleanup(); clients.splice(0).forEach(client => client.clear()); });
describe('current-view post lists', () => {
  it('does not run a lease timer for closed or hidden readers', () => {
    const timer = vi.spyOn(window, 'setInterval'), clear = vi.spyOn(window, 'clearInterval');
    const hook = renderHook(({ enabled }) => usePostReadView(enabled), { initialProps: { enabled: false } });
    expect(timer).not.toHaveBeenCalled(); hook.rerender({ enabled: true }); expect(timer).toHaveBeenCalledWith(expect.any(Function), 1000);
    hook.rerender({ enabled: false }); expect(clear).toHaveBeenCalled(); timer.mockRestore(); clear.mockRestore();
  });
  it('requires deliberate window transition after four pages and can return to freshly read newer posts', async () => {
    state.list.mockImplementation(async (input, guard) => { guard(); const current = input.cursor ? parseInt(input.cursor, 16) : 0;
      return { posts: [{ id: `post-${current}` }], unavailableSavedPostIds: [], nextCursor: (current + 1).toString(16).padStart(48, '0'), leaseUntil: Date.now() + 30000 }; });
    const hook = renderHook(() => useSocialPostList({ scope: 'profile', targetId: 'bob' }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    for (let page = 2; page <= 4; page++) { await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.data).toHaveLength(page)); }
    expect(hook.result.current.hasNextPage).toBe(false); expect(hook.result.current.hasMoreWindow).toBe(true);
    await act(async () => { await hook.result.current.fetchNextPage(); }); expect(state.list).toHaveBeenCalledTimes(4);
    expect(hook.result.current.data?.map(post => post.id)).toEqual(['post-0', 'post-1', 'post-2', 'post-3']);
    let finish!: () => void;
    state.list.mockImplementationOnce(async (_input, guard) => { await new Promise<void>(resolve => { finish = resolve; }); guard();
      return { posts: [{ id: 'post-4' }], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30000 }; });
    await act(async () => { await hook.result.current.advanceWindow(); });
    expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isPending).toBe(true);
    await act(async () => { finish(); }); await waitFor(() => expect(hook.result.current.data?.[0]?.id).toBe('post-4'));
    expect(hook.result.current.hasPreviousWindow).toBe(true);
    act(() => hook.result.current.previousWindow()); await waitFor(() => expect(hook.result.current.data?.[0]?.id).toBe('post-0'));
    expect(state.list.mock.calls.at(-1)?.[0].cursor).toBeUndefined();
  });
  it('a newer saved-page denial removes already displayed duplicates immediately', async () => {
    state.list.mockResolvedValueOnce({ posts: [{ id: 'one' }], unavailableSavedPostIds: [], nextCursor: 'a'.repeat(48), leaseUntil: Date.now() + 30000 })
      .mockResolvedValueOnce({ posts: [], unavailableSavedPostIds: ['one'], nextCursor: null, leaseUntil: Date.now() + 30000 });
    const hook = renderHook(() => useSocialPostList({ scope: 'saved' }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1)); await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.data).toEqual([])); expect(hook.result.current.unavailableSavedPostIds).toEqual(['one']);
  });
  it('waits for canonical profile, masks changed selection and retains empty-page continuation', async () => {
    state.ready = false; const hook = renderHook(({ target }) => useSocialPostList({ scope: 'profile', targetId: target }), { wrapper: wrapper(), initialProps: { target: 'bob' } });
    expect(state.list).not.toHaveBeenCalled(); state.ready = true; hook.rerender({ target: 'bob' }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    state.list.mockResolvedValue({ posts: [], unavailableSavedPostIds: [], nextCursor: 'a'.repeat(48), leaseUntil: Date.now() + 30000 });
    hook.rerender({ target: 'charlie' }); expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true)); expect(hook.result.current.data).toEqual([]);
  });
  it('deduplicates profile pins and never revives old text after denied refresh', async () => {
    state.list.mockResolvedValueOnce({ posts: [{ id: 'pinned' }], unavailableSavedPostIds: [], nextCursor: 'a'.repeat(48), leaseUntil: Date.now() + 30000 })
      .mockResolvedValueOnce({ posts: [{ id: 'pinned' }, { id: 'two' }], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30000 });
    const hook = renderHook(() => useSocialPostList({ scope: 'profile', targetId: 'bob' }), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true)); await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(2)); state.list.mockRejectedValue(new Error('Access changed'));
    await act(async () => { await hook.result.current.refetch(); }); await waitFor(() => expect(hook.result.current.data).toBeUndefined()); expect(hook.result.current.isError).toBe(true);
  });
  it('requires fresh reads after account ABA, visibility and close/reopen, masking saved references too', async () => {
    const hook = renderHook(({ enabled }) => useSocialPostList({ scope: 'saved' }, enabled), { wrapper: wrapper(), initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.unavailableSavedPostIds).toEqual(['gone'])); state.list.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ enabled: false }); expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.unavailableSavedPostIds).toEqual([]);
    hook.rerender({ enabled: true }); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'bob'; state.epoch++; hook.rerender({ enabled: true }); state.uid = 'alice'; state.epoch++; hook.rerender({ enabled: true }); expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toBeUndefined();
  });
  it('expires visible data even when refresh is stuck and ignores its late closed result', async () => {
    const hook = renderHook(({ enabled }) => useSocialPostList({ scope: 'saved' }, enabled), { wrapper: wrapper(), initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1)); let finish!: () => void;
    state.list.mockImplementation(async (_input, guard) => { await new Promise<void>(resolve => { finish = resolve; }); guard(); return { posts: [{ id: 'late' }], unavailableSavedPostIds: [], nextCursor: null, leaseUntil: Date.now() + 30000 }; });
    act(() => { void hook.result.current.refetch(); });
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000); await act(async () => { await new Promise(resolve => setTimeout(resolve, 1100)); }); expect(hook.result.current.data).toBeUndefined(); clock.mockRestore(); expect(hook.result.current.isError).toBe(true);
    hook.rerender({ enabled: false }); await act(async () => { finish(); }); expect(hook.result.current.data).toBeUndefined();
  });
});
describe('visible profile count', () => {
  it('distinguishes exact, lower-bound and unavailable without leaking count across profile/account', async () => {
    state.summary.mockImplementation(async (_input, guard) => { guard(); return { count: 200, hasMore: true, leaseUntil: Date.now() + 30000 }; });
    const hook = renderHook(({ target }) => useVisiblePostCount(target), { wrapper: wrapper(), initialProps: { target: 'bob' } });
    await waitFor(() => expect(hook.result.current.label).toBe('200+')); expect(hook.result.current.exact).toBe(false);
    state.summary.mockImplementation(() => new Promise(() => {})); hook.rerender({ target: 'charlie' }); expect(hook.result.current.label).toBe('—');
    state.epoch++; hook.rerender({ target: 'bob' }); expect(hook.result.current.count).toBeNull();
  });
  it('masks expired or denied exact counts', async () => {
    const hook = renderHook(() => useVisiblePostCount('bob'), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.label).toBe('12'));
    expect(hook.result.current.exact).toBe(true); state.summary.mockRejectedValue(new Error('Denied'));
    await act(async () => { await hook.result.current.retry(); }); await waitFor(() => expect(hook.result.current.count).toBeNull()); expect(hook.result.current.label).toBe('—');
  });
  it('does not inherit production keep-previous placeholders after a viewer UID change', async () => {
    const hook = renderHook(() => useVisiblePostCount('bob'), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.label).toBe('12'));
    let finish!: () => void;
    state.summary.mockImplementation(async (_input, guard) => { await new Promise<void>(resolve => { finish = resolve; }); guard();
      return { count: 2, hasMore: false, leaseUntil: Date.now() + 30000 }; });
    state.uid = 'charlie'; state.epoch++; hook.rerender();
    expect(hook.result.current.count).toBeNull(); expect(hook.result.current.label).toBe('—'); expect(hook.result.current.exact).toBe(false);
    await waitFor(() => expect(state.summary).toHaveBeenLastCalledWith(expect.objectContaining({ expectedOwnerUid: 'charlie', expectedProfileId: 'profile-charlie', targetId: 'bob' }), expect.any(Function)));
    await act(async () => { finish(); }); await waitFor(() => expect(hook.result.current.label).toBe('2'));
  });
});
