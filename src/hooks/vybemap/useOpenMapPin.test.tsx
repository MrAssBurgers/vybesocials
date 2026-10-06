import { act, cleanup, renderHook as renderBaseHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'uid-alice', epoch: 1, read: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { ready: true, user: { id: uid }, profile: { id: 'alice' }, session: { uid, epoch }, guard: () => { if (uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapPinService', () => ({ readMapPin: state.read }));
import { mapPinFixture } from '@/test/mapPinFixture';
import { useOpenMapPin } from './useOpenMapPin';
const held = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
let client: QueryClient;
const renderHook: typeof renderBaseHook = (callback, options) => renderBaseHook(callback, { ...options, wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); state.uid = 'uid-alice'; state.epoch = 1; state.read.mockReset(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('opening current map sources', () => {
  it.each([['post', '/p/'], ['short', '/clips/'], ['video', '/watch/']] as const)('rechecks %s before its independently admitted reader', async (sourceType, base) => {
    const pin = mapPinFixture({ sourceType, kind: sourceType === 'short' ? 'clip' : 'post', sourceId: 'id ?#' });
    state.read.mockResolvedValue({ pin, validUntil: Date.now() + 15000 }); const navigate = vi.fn();
    const hook = renderHook(() => useOpenMapPin([pin], '3d', navigate));
    await act(async () => { await hook.result.current.open(pin); });
    expect(state.read).toHaveBeenCalledWith({ uid: 'uid-alice', profileId: 'alice' }, pin.id, expect.any(Function));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(base + 'id%20%3F%23');
  });
  it('suppresses duplicate taps and prevents a slower earlier selection from navigating', async () => {
    const first = mapPinFixture(), second = mapPinFixture({ id: 'd'.repeat(64), sourceId: 'second' });
    const old = held<any>(), fresh = held<any>(); state.read.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const navigate = vi.fn(), hook = renderHook(() => useOpenMapPin([first, second], '3d', navigate));
    let a!: Promise<void>, b!: Promise<void>;
    act(() => { a = hook.result.current.open(first); void hook.result.current.open(first); });
    await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    act(() => { b = hook.result.current.open(second); }); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve({ pin: first, validUntil: Date.now() + 15000 }); await a; });
    expect(navigate).not.toHaveBeenCalled(); expect(hook.result.current.isPending).toBe(true);
    await act(async () => { fresh.resolve({ pin: second, validUntil: Date.now() + 15000 }); await b; });
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/p/second');
  });
  it.each(['account', 'hidden', 'pagehide', 'unmount', 'renderer', 'removed', 'revision', 'cancel'] as const)('retires delayed opening after %s', async change => {
    const pin = mapPinFixture(), late = held<any>(); state.read.mockReturnValue(late.promise); const navigate = vi.fn();
    const hook = renderHook(({ pins, renderer }) => useOpenMapPin(pins, renderer, navigate), { initialProps: { pins: [pin], renderer: '3d' } });
    let operation!: Promise<void>; act(() => { operation = hook.result.current.open(pin); }); await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    if (change === 'account') { state.uid = 'different'; state.epoch++; hook.rerender({ pins: [pin], renderer: '3d' }); }
    if (change === 'hidden') act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    if (change === 'pagehide') act(() => window.dispatchEvent(new Event('pagehide')));
    if (change === 'unmount') hook.unmount();
    if (change === 'renderer') hook.rerender({ pins: [pin], renderer: 'flat' });
    if (change === 'removed') hook.rerender({ pins: [], renderer: '3d' });
    if (change === 'revision') hook.rerender({ pins: [{ ...pin, revision: 'd'.repeat(48) }], renderer: '3d' });
    if (change === 'cancel') act(() => hook.result.current.dismiss());
    expect(() => state.read.mock.calls[0][2]()).toThrow();
    await act(async () => { late.resolve({ pin, validUntil: Date.now() + 15000 }); await operation; }); expect(navigate).not.toHaveBeenCalled();
  });
  it.each(['denied', 'expired', 'replaced'] as const)('never navigates on a %s admission', async reason => {
    const pin = mapPinFixture(); state.read.mockResolvedValue({ pin: reason === 'denied' ? null : reason === 'replaced' ? { ...pin, revision: 'd'.repeat(48) } : pin, validUntil: Date.now() + (reason === 'expired' ? -1 : 15000) });
    const navigate = vi.fn(), hook = renderHook(() => useOpenMapPin([pin], '3d', navigate));
    await act(async () => { await hook.result.current.open(pin); }); expect(navigate).not.toHaveBeenCalled(); expect(hook.result.current.error).toBeTruthy(); expect(hook.result.current.isPending).toBe(false);
  });
  it('bounds the entire opening operation and offers a fresh retry without accepting a late reply', async () => {
    vi.useFakeTimers(); const pin = mapPinFixture(), late = held<any>(); state.read.mockReturnValueOnce(late.promise);
    const navigate = vi.fn(), hook = renderHook(() => useOpenMapPin([pin], '3d', navigate)); let operation!: Promise<void>;
    await act(async () => { operation = hook.result.current.open(pin); await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await operation; }); expect(hook.result.current.error).toMatch(/too long/);
    await act(async () => { late.resolve({ pin, validUntil: Date.now() + 15000 }); await Promise.resolve(); }); expect(navigate).not.toHaveBeenCalled();
    state.read.mockResolvedValue({ pin, validUntil: Date.now() + 15000 }); await act(async () => { await hook.result.current.retry(); }); expect(navigate).toHaveBeenCalledExactlyOnceWith('/p/shared-post');
  });
  it.each(['denied', 'replaced', 'network'] as const)('retires older cached pin data only on checked denial or replacement (%s)', async reason => {
    const pin = mapPinFixture(), other = mapPinFixture({ id: 'e'.repeat(64), sourceId: 'other' });
    const prefix = ['map-pins', 'uid-alice', 'alice', 1], key = [...prefix, 'list', 'post', null, 0];
    const data = { pages: [{ kind: 'post', items: [pin, other], nextCursor: null, validUntil: Date.now() + 15000 }], pageParams: [undefined] };
    const stateValidUntil = Date.now() + 15000;
    client.setQueryData(key, data); client.setQueryData([...prefix, 'state', 'post', pin.sourceId, 0], { pin, validUntil: stateValidUntil });
    const foreignKey = ['map-pins', 'uid-bob', 'bob', 2, 'list', 'post', null, 0]; client.setQueryData(foreignKey, data);
    if (reason === 'network') state.read.mockRejectedValue(new Error('Network unavailable'));
    else state.read.mockResolvedValue({ pin: reason === 'denied' ? null : { ...pin, revision: 'd'.repeat(48) }, validUntil: Date.now() + 15000 });
    const navigate = vi.fn(), hook = renderHook(() => useOpenMapPin([pin, other], '3d', navigate));
    await act(async () => { await hook.result.current.open(pin); });
    expect((client.getQueryData(key) as typeof data).pages[0].items).toEqual(reason === 'network' ? [pin, other] : [other]);
    expect((client.getQueryData(foreignKey) as typeof data).pages[0].items).toEqual([pin, other]);
    expect((client.getQueryData([...prefix, 'state', 'post', pin.sourceId, 0]) as { validUntil: number }).validUntil).toBe(reason === 'network' ? stateValidUntil : 0);
    expect(navigate).not.toHaveBeenCalled();
  });
});
