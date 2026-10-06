import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, request: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { uid, epoch }, ready: !!uid,
    guard: () => { if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/locationSharingService', () => ({ locationSharingRequest: (...args: unknown[]) => state.request(...args) }));
import { useLocationSharing } from './useLocationSharing';
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const read = () => ({ serverTime: Date.now(), leaseUntil: Date.now() + 15_000, locations: [{ id: 'bob', latitude: 40, longitude: -87, expiresAt: new Date(Date.now() + 120_000).toISOString() }], shares: [], requests: [] });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); state.uid = 'alice'; state.epoch++;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  client = new QueryClient({ defaultOptions: { queries: { placeholderData: old => old, gcTime: 14 * 86400_000, refetchOnMount: false } } });
  state.request.mockImplementation(() => { const result = read(); return new Promise(resolve => setTimeout(() => resolve(result), 2_000)); });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
async function advance(ms: number) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
describe('location sharing refresh continuity', () => {
  it.each(['online', 'app-resumed'])('rechecks a failed read immediately on %s instead of waiting for polling', async event => {
    state.request.mockRejectedValueOnce(new Error('Network unavailable'));
    const hook = renderHook(() => useLocationSharing(), { wrapper }); await advance(1);
    expect(hook.result.current.isError).toBe(true);
    act(() => document.dispatchEvent(new CustomEvent(event, { bubbles: true }))); await advance(1);
    expect(state.request).toHaveBeenCalledTimes(2);
    expect(hook.result.current.data).toBeUndefined();
    await advance(2_010); expect(hook.result.current.data?.locations[0].id).toBe('bob');
  });
  it('retires native background grants and ignores reconnect until the app resumes', async () => {
    const hook = renderHook(() => useLocationSharing(), { wrapper }); await advance(2_010);
    expect(hook.result.current.data).toBeDefined();
    act(() => document.dispatchEvent(new CustomEvent('app-paused', { bubbles: true }))); await advance(1);
    expect(hook.result.current.data).toBeUndefined();
    act(() => window.dispatchEvent(new Event('online'))); await advance(1);
    expect(state.request).toHaveBeenCalledOnce();
    act(() => document.dispatchEvent(new CustomEvent('app-resumed', { bubbles: true }))); await advance(1);
    expect(state.request).toHaveBeenCalledTimes(2); expect(hook.result.current.data).toBeUndefined();
    await advance(2_010); expect(hook.result.current.data).toBeDefined();
  });
  it('discards the old grant while a reconnect checks for revoked access', async () => {
    const hook = renderHook(() => useLocationSharing(), { wrapper }); await advance(2_010);
    expect(hook.result.current.data).toBeDefined();
    state.request.mockRejectedValue(new Error('Access revoked'));
    act(() => window.dispatchEvent(new Event('online'))); await advance(1);
    expect(hook.result.current.data).toBeUndefined(); expect(hook.result.current.isError).toBe(true);
  });
  it('keeps admitted friends through normal delayed refreshes without extending an expired lease', async () => {
    let admitted = false; const gaps: number[] = [];
    const hook = renderHook(() => { const query = useLocationSharing(); if (query.data) admitted = true; else if (admitted) gaps.push(Date.now()); return query; }, { wrapper });
    for (let i = 0; i < 150; i++) await advance(250);
    expect(hook.result.current.data?.locations[0].id).toBe('bob'); expect(state.request.mock.calls.length).toBeGreaterThanOrEqual(3); expect(gaps).toEqual([]);
  });
  it('still removes expired coordinates when the early refresh stalls', async () => {
    const hook = renderHook(() => useLocationSharing(), { wrapper }); await advance(2_010);
    expect(hook.result.current.data?.locations[0].id).toBe('bob');
    state.request.mockReturnValue(new Promise(() => {})); await advance(10_010);
    expect(state.request).toHaveBeenCalledTimes(2); expect(hook.result.current.data?.locations[0].id).toBe('bob');
    await advance(3_010); expect(hook.result.current.data).toBeUndefined();
  });
  it('masks a denied early refresh immediately instead of retaining the prior coordinates', async () => {
    const hook = renderHook(() => useLocationSharing(), { wrapper }); await advance(2_010); expect(hook.result.current.data).toBeDefined();
    state.request.mockRejectedValue(new Error('Unavailable')); await advance(10_010); await advance(1);
    expect(hook.result.current.isError).toBe(true); expect(hook.result.current.data).toBeUndefined();
  });
});
