import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, search: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { epoch }, ready: !!uid,
    guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapbox/geocode', () => ({ resolveTeleportQuery: (...args: unknown[]) => state.search(...args) }));
import { useMapSearch } from './useMapSearch';
const hit = { lat: 40, lng: -87, label: 'First place' };
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch++; state.search.mockResolvedValue(hit); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); vi.useRealTimers(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
describe('map search lifecycle', () => {
  it('only jumps for the latest search even if an older provider ignores abort', async () => {
    const older = held<typeof hit>(); state.search.mockReturnValueOnce(older.promise); const jump = vi.fn();
    const hook = renderHook(() => useMapSearch(jump, '3d')); let task!: Promise<boolean>;
    act(() => { task = hook.result.current.search('first'); }); const oldSignal = state.search.mock.calls[0][1];
    await act(async () => { expect(await hook.result.current.search('latest')).toBe(true); });
    expect(oldSignal.aborted).toBe(true); expect(jump).toHaveBeenCalledOnce();
    await act(async () => { older.resolve(hit); expect(await task).toBe(false); }); expect(jump).toHaveBeenCalledOnce();
  });
  it.each(['cancel', 'hidden', 'pagehide', 'unmount', 'account', 'renderer'] as const)('retires late results after %s', async reason => {
    const older = held<typeof hit>(); state.search.mockReturnValueOnce(older.promise); const jump = vi.fn();
    const hook = renderHook(({ renderer }) => useMapSearch(jump, renderer), { initialProps: { renderer: '3d' } }); let task!: Promise<boolean>;
    act(() => { task = hook.result.current.search('first'); });
    if (reason === 'cancel') act(() => hook.result.current.cancel());
    if (reason === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    if (reason === 'hidden') act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    if (reason === 'unmount') hook.unmount();
    if (reason === 'account') { state.uid = 'bob'; state.epoch++; hook.rerender({ renderer: '3d' }); state.uid = 'alice'; state.epoch++; hook.rerender({ renderer: '3d' }); }
    if (reason === 'renderer') { hook.rerender({ renderer: '2d' }); hook.rerender({ renderer: '3d' }); }
    expect(state.search.mock.calls[0][1].aborted).toBe(true);
    await act(async () => { older.resolve(hit); expect(await task).toBe(false); }); expect(jump).not.toHaveBeenCalled();
    if (reason !== 'unmount') { expect(hook.result.current.error).toBe(''); expect(hook.result.current.isPending).toBe(false); }
  });
  it('exposes a deadline and successful retry without admitting the late response', async () => {
    vi.useFakeTimers(); const older = held<typeof hit>(); state.search.mockReturnValueOnce(older.promise); const jump = vi.fn();
    const hook = renderHook(() => useMapSearch(jump, '3d')); let task!: Promise<boolean>;
    act(() => { task = hook.result.current.search('first'); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); expect(await task).toBe(false); });
    expect(hook.result.current.error).toMatch(/took too long/); expect(hook.result.current.isPending).toBe(false); expect(state.search.mock.calls[0][1].aborted).toBe(true);
    await act(async () => { older.resolve(hit); await Promise.resolve(); }); expect(jump).not.toHaveBeenCalled();
    await act(async () => { expect(await hook.result.current.search('retry')).toBe(true); }); expect(jump).toHaveBeenCalledOnce();
  });
  it('distinguishes an empty result from failure and clears old error on editing', async () => {
    const jump = vi.fn(); state.search.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('Service offline'));
    const hook = renderHook(() => useMapSearch(jump, '3d'));
    await act(async () => { expect(await hook.result.current.search('missing')).toBe(false); }); expect(hook.result.current.error).toMatch(/No matching/);
    await act(async () => { expect(await hook.result.current.search('retry')).toBe(false); }); expect(hook.result.current.error).toBe('Service offline');
    act(() => hook.result.current.cancel()); expect(hook.result.current.error).toBe(''); expect(jump).not.toHaveBeenCalled();
  });
});
