import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, request: vi.fn(), attempt: vi.fn(), complete: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, ready: !!uid,
    guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapSocialService', () => ({ mapSocialRequest: (...args: unknown[]) => state.request(...args), mapSocialAttempt: (...args: unknown[]) => state.attempt(...args) }));
import { useMapSocialItem, useMapSocialList, useMapSocialMutation } from './useMapSocial';
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const item = { id: 'spot', name: 'Alice private spot' };
const page = () => ({ items: [item], nextCursor: null, serverTime: Date.now(), validUntil: Date.now() + 15_000 });
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.epoch++;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: old => old, refetchOnMount: false, gcTime: 14 * 86400_000 } } });
  state.request.mockImplementation(async (_actor, input, guard) => { guard(); return input.action === 'read' ? { item, validUntil: Date.now() + 15_000 } : page(); });
  state.attempt.mockImplementation(async (_actor, input) => ({ body: { ...input, requestId: 'request' }, complete: state.complete }));
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('map admission cache', () => {
  it('does not reuse previous-account placeholders or late replies on account ABA', async () => {
    const late = held<ReturnType<typeof page>>();
    const hook = renderHook(() => useMapSocialList('places'), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    state.request.mockReturnValue(late.promise);
    state.uid = 'bob'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'alice'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); await act(async () => late.resolve(page()));
    await waitFor(() => expect(client.getQueryCache().getAll().filter(q => q.state.data !== undefined)).toHaveLength(0));
  });
  it('does not mistake a failed refresh for an empty successful feed', async () => {
    const hook = renderHook(() => useMapSocialList('places'), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    state.request.mockRejectedValue(new Error('offline'));
    await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toBeUndefined();
  });
  it('masks an expired read while its next request is still pending', async () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useMapSocialItem('place', 'spot'), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(5); });
    expect(hook.result.current.data).toEqual(item);
    state.request.mockReturnValue(new Promise(() => {}));
    await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(hook.result.current.data).toBeUndefined();
  });
  it('requires a fresh foreground read instead of restoring a hidden-page location', async () => {
    const hook = renderHook(() => useMapSocialList('checkIns'), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    state.request.mockReturnValue(new Promise(() => {}));
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  });
  it('keeps pagination when a filtered page has no visible rows', async () => {
    state.request.mockResolvedValueOnce({ ...page(), items: [], nextCursor: 'cursor' }).mockResolvedValueOnce(page());
    const hook = renderHook(() => useMapSocialList('checkIns'), { wrapper });
    await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true));
    expect(hook.result.current.data).toEqual([]);
    await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.data).toEqual([item]));
  });
  it('continues beyond three pages only through an explicit fresh group and can return to the first', async () => {
    state.request.mockImplementation(async (_actor, input) => {
      const n = Number(input.cursor || 0);
      return { ...page(), items: [{ ...item, id: `spot-${n}` }], nextCursor: n < 4 ? String(n + 1) : null };
    });
    const hook = renderHook(() => useMapSocialList('places'), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.[0].id).toBe('spot-0'));
    await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(2));
    await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.nextGroup).toBe(true));
    expect(hook.result.current.data?.map(row => row.id)).toEqual(['spot-0', 'spot-1', 'spot-2']);
    await act(async () => { await hook.result.current.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.data?.map(row => row.id)).toEqual(['spot-3']));
    expect(hook.result.current.windowed).toBe(true);
    await act(async () => { await hook.result.current.restart(); });
    await waitFor(() => expect(hook.result.current.data?.map(row => row.id)).toEqual(['spot-0']));
  });
});
describe('map mutation acknowledgements', () => {
  it('never claims going when a replay reports a later leave', async () => {
    state.request.mockResolvedValue({ resourceId: 'meetup', status: 'left', item: null });
    const hook = renderHook(() => useMapSocialMutation('meetup'), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ action: 'joinMeetup', meetupId: 'meetup', expectedRevision: null })).rejects.toThrow('changed'); });
    expect(state.complete).toHaveBeenCalledOnce();
  });
  it('keeps an uncertain request and rejects duplicate concurrent clicks', async () => {
    const late = held<never>(); state.request.mockReturnValue(late.promise);
    const hook = renderHook(() => useMapSocialMutation('spot'), { wrapper });
    let first!: Promise<unknown>;
    await act(async () => { first = hook.result.current.mutateAsync({ action: 'checkIn', placeId: 'spot' }); await Promise.resolve(); });
    await act(async () => { await expect(hook.result.current.mutateAsync({ action: 'checkIn', placeId: 'spot' })).rejects.toThrow('still saving'); });
    state.uid = 'bob'; state.epoch++;
    await act(async () => { late.resolve(undefined as never); await expect(first).rejects.toThrow('Account changed'); });
    expect(state.complete).not.toHaveBeenCalled();
  });
});
