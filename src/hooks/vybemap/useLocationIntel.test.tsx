import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ fetch: vi.fn(), uid: 'alice', epoch: 1, ready: true }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch }, ready: state.ready,
    guard: () => { if (!state.ready || state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/locationIntel', () => ({ fetchLocationIntel: (...args: unknown[]) => state.fetch(...args) }));
import { useLocationIntel } from './useLocationIntel';
const clients: QueryClient[] = [];
const wrapper = () => { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, refetchOnMount: false } } }); clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; };
const opts = { latitude: 40, longitude: -80, placeId: 'spot' };
const response = (summary = 'Current area', lease = 15000) => ({ intel: { summary }, validUntil: Date.now() + lease });
beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); state.uid = 'alice'; state.epoch++; state.ready = true;
  state.fetch.mockReset().mockImplementation(async (_actor, _input, guard) => { guard(); return response(); });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.useRealTimers(); vi.restoreAllMocks(); });
describe('current-view area intelligence', () => {
  it('waits for a canonical account and masks old account/selection despite production placeholders', async () => {
    state.ready = false; const hook = renderHook(({ placeId }) => useLocationIntel({ ...opts, placeId }), { wrapper: wrapper(), initialProps: { placeId: 'spot' } });
    expect(state.fetch).not.toHaveBeenCalled(); state.ready = true; hook.rerender({ placeId: 'spot' }); await waitFor(() => expect(hook.result.current.data?.summary).toBe('Current area'));
    state.fetch.mockImplementation(() => new Promise(() => {})); hook.rerender({ placeId: 'next' }); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'bob'; state.epoch++; hook.rerender({ placeId: 'spot' }); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'alice'; state.epoch++; hook.rerender({ placeId: 'spot' }); expect(hook.result.current.data).toBeUndefined();
  });
  it('masks denied refresh and exposes a working deliberate retry', async () => {
    const hook = renderHook(() => useLocationIntel(opts), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    state.fetch.mockRejectedValueOnce(new Error('Not available'));
    await act(async () => { await hook.result.current.refetch(); }); await waitFor(() => expect(hook.result.current.isFailed).toBe(true)); expect(hook.result.current.data).toBeUndefined();
    await act(async () => { await hook.result.current.refreshIntel(); }); await waitFor(() => expect(hook.result.current.data?.summary).toBe('Current area'));
    expect(state.fetch.mock.calls.some(call => call[1].forceRefresh === false)).toBe(true);
  });
  it('retires hidden/closed reads and requires new admission when reopened', async () => {
    const hook = renderHook(({ enabled }) => useLocationIntel({ ...opts, enabled }), { wrapper: wrapper(), initialProps: { enabled: true } });
    await waitFor(() => expect(hook.result.current.data).toBeDefined()); state.fetch.mockImplementation(() => new Promise(() => {}));
    hook.rerender({ enabled: false }); expect(hook.result.current.data).toBeUndefined(); hook.rerender({ enabled: true }); expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); expect(hook.result.current.data).toBeUndefined();
  });
  it('expires a displayed result even if renewal hangs', async () => {
    state.fetch.mockImplementationOnce(async () => response('Short lease', 70)).mockImplementation(() => new Promise(() => {}));
    const hook = renderHook(() => useLocationIntel(opts), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.data?.summary).toBe('Short lease'));
    await waitFor(() => expect(hook.result.current.data).toBeUndefined());
  });
  it('does not install a force refresh after its selection changes', async () => {
    const hook = renderHook(({ placeId }) => useLocationIntel({ ...opts, placeId }), { wrapper: wrapper(), initialProps: { placeId: 'spot' } });
    await waitFor(() => expect(hook.result.current.data).toBeDefined()); let finish!: () => void;
    state.fetch.mockImplementationOnce(async (_actor, _input, guard) => { await new Promise<void>(resolve => { finish = resolve; }); guard(); return response('Old forced'); });
    let refresh!: Promise<void>; act(() => { refresh = hook.result.current.refreshIntel(); }); await waitFor(() => expect(finish).toBeDefined());
    hook.rerender({ placeId: 'next' }); await waitFor(() => expect(hook.result.current.data?.summary).toBe('Current area'));
    await act(async () => { finish(); await refresh; }); expect(hook.result.current.data?.summary).toBe('Current area');
  });
  it('debounces draft-name research and never displays previous-name intelligence', async () => {
    const hook = renderHook(({ name }) => useLocationIntel({ latitude: 40, longitude: -80, placeName: name }), { wrapper: wrapper(), initialProps: { name: 'P' } });
    hook.rerender({ name: 'Pa' }); hook.rerender({ name: 'Park' }); expect(state.fetch).not.toHaveBeenCalled();
    await waitFor(() => expect(hook.result.current.data).toBeDefined()); expect(state.fetch).toHaveBeenCalledTimes(1); expect(state.fetch.mock.calls[0][1].placeName).toBe('Park');
    hook.rerender({ name: 'Other park' }); expect(hook.result.current.data).toBeUndefined();
  });
});
