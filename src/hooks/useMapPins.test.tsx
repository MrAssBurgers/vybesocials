import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, request: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, ready: !!uid,
    guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapPinService', () => ({ manageMapPin: (...args: unknown[]) => state.request(...args) }));
import { useMapPinList, useMapPinState } from './useMapPins';
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const item = { id: 'pin', areaLabel: 'Admitted area' };
const page = () => ({ kind: 'post', items: [item], nextCursor: null, validUntil: Date.now() + 15_000 });
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
function visibility(value: string) { act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')); }); }
beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.epoch++;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: old => old, refetchOnMount: false, gcTime: 14 * 86400_000 } } });
  state.request.mockImplementation(async (_actor, input, guard) => { guard(); return input.action === 'state' ? { kind: input.kind, sourceId: input.sourceId, status: 'unshared', canShare: true, validUntil: Date.now() + 15_000 } : page(); });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('map pin admitted query lifecycle', () => {
  it('requires a fresh read after prior-success layer off→on with production cache defaults', async () => {
    const hook = renderHook(({ enabled }) => useMapPinList('post', enabled), { wrapper, initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    const late = held<ReturnType<typeof page>>(); state.request.mockReturnValue(late.promise);
    hook.rerender({ enabled: false }); expect(hook.result.current.data).toBeUndefined();
    hook.rerender({ enabled: true }); expect(hook.result.current.data).toBeUndefined(); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
    await act(async () => late.resolve({ ...page(), items: [] })); await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('never accepts a pre-disable pending result after off→on', async () => {
    const old = held<ReturnType<typeof page>>(), fresh = held<ReturnType<typeof page>>(); state.request.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const hook = renderHook(({ enabled }) => useMapPinList('post', enabled), { wrapper, initialProps: { enabled: true } });
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(1));
    hook.rerender({ enabled: false }); hook.rerender({ enabled: true }); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
    await act(async () => old.resolve(page())); expect(hook.result.current.data).toBeUndefined();
    await act(async () => fresh.resolve({ ...page(), items: [] })); await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('masks placeholder data and stale owner state across A→B→A', async () => {
    const hook = renderHook(() => useMapPinState('post', 'source'), { wrapper });
    await waitFor(() => expect(hook.result.current.data?.sourceId).toBe('source'));
    const late = held<never>(); state.request.mockReturnValue(late.promise);
    state.uid = 'bob'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'alice'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); await act(async () => late.resolve(undefined as never));
    await waitFor(() => expect(client.getQueryCache().getAll().filter(q => q.state.data !== undefined)).toHaveLength(0));
  });
  it('retains no old area through hidden→visible while a request is pending', async () => {
    const hook = renderHook(() => useMapPinList('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    state.request.mockReturnValue(new Promise(() => {})); visibility('hidden'); expect(hook.result.current.data).toBeUndefined(); visibility('visible'); expect(hook.result.current.data).toBeUndefined();
    await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
  });
  it('shows a failed refresh as error instead of stale pins or a successful empty list', async () => {
    const hook = renderHook(() => useMapPinList('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    state.request.mockRejectedValue(new Error('offline')); await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toBeUndefined();
  });
  it('continues filtered empty pages and explicitly windows after three pages', async () => {
    state.request.mockImplementation(async (_actor, input) => { const n = Number(input.cursor || 0); return { ...page(), items: n === 0 ? [] : [{ ...item, id: `pin-${n}` }], nextCursor: n < 4 ? String(n + 1) : null }; });
    const hook = renderHook(() => useMapPinList('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toEqual([])); expect(hook.result.current.hasNextPage).toBe(true);
    await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.nextGroup).toBe(true));
    await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.data?.map(row => row.id)).toEqual(['pin-3'])); expect(hook.result.current.windowed).toBe(true);
    await act(async () => { await hook.result.current.restart(); }); await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('expires admission even if the next poll never returns', async () => {
    const hook = renderHook(() => useMapPinList('post'), { wrapper }); await waitFor(() => expect(hook.result.current.data).toEqual([item]));
    vi.useFakeTimers(); state.request.mockReturnValue(new Promise(() => {}));
    // Force a fresh receipt with a timer installed under fake time.
    state.request.mockResolvedValueOnce({ ...page(), validUntil: Date.now() + 500 }); await act(async () => { await hook.result.current.refetch(); await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(501); }); expect(hook.result.current.data).toBeUndefined();
  });
});
