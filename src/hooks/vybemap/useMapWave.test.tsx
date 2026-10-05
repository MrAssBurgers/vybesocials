import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { LiveFriend } from '@/lib/vybemap/types';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, send: vi.fn(), acknowledge: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: uid ? { id: uid } : null, profile: { id: `profile-${uid}` }, session: { epoch }, ready: !!uid,
    guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapSocial', () => ({ sendMapWave: (...args: unknown[]) => state.send(...args) }));
import { useMapWave } from './useMapWave';
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const friend = (id = 'profile-bob'): LiveFriend => ({ id: `sample-${id}`, user_id: id, latitude: 0, longitude: 0, label: null, updated_at: new Date().toISOString(), expires_at: null, sharing_enabled: true, accessRevision: 'a'.repeat(48), accessUntil: Date.now() + 120_000 });
const receipt = (extra = {}) => ({ notificationId: 'notification-one', cooldownUntil: Date.now() + 60_000, replayed: false, acknowledge: state.acknowledge, ...extra });
function visibility(value: 'hidden' | 'visible') { Object.defineProperty(document, 'visibilityState', { configurable: true, value }); document.dispatchEvent(new Event('visibilitychange')); }
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch++; Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); state.send.mockImplementation(async () => receipt()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('map wave selected-view lifecycle', () => {
  it('sends once for duplicate taps, acknowledges success and waits for the actual cooldown', async () => {
    vi.useFakeTimers(); const late = held<ReturnType<typeof receipt>>(); state.send.mockReturnValue(late.promise);
    const target = friend(), hook = renderHook(() => useMapWave(target)); let task!: Promise<void>;
    act(() => { task = hook.result.current.send(); void hook.result.current.send(); });
    expect(state.send).toHaveBeenCalledOnce(); expect(hook.result.current.isPending).toBe(true); expect(hook.result.current.message).toBe('');
    expect(state.send.mock.calls[0].slice(0, 2)).toEqual([{ uid: 'alice', profileId: 'profile-alice' }, { targetProfileId: target.user_id, expectedAccessRevision: target.accessRevision }]);
    await act(async () => { late.resolve(receipt()); await task; });
    expect(state.acknowledge).toHaveBeenCalledOnce(); expect(hook.result.current.message).toBe('Wave sent.'); expect(hook.result.current.cooldownSeconds).toBe(60);
    await act(async () => { await hook.result.current.send(); }); expect(state.send).toHaveBeenCalledOnce();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); }); expect(hook.result.current.cooldownSeconds).toBe(0);
  });
  it('shows failure and retries without announcing success first', async () => {
    state.send.mockRejectedValueOnce(new Error('Offline. Please retry.')); const hook = renderHook(() => useMapWave(friend()));
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.error).toContain('Offline'); expect(state.acknowledge).not.toHaveBeenCalled(); expect(hook.result.current.message).toBe('');
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.error).toBe(''); expect(hook.result.current.message).toBe('Wave sent.');
  });
  it('keeps confirmed feedback while a fresh same-revision poll renews the selected friend', async () => {
    vi.useFakeTimers(); const target = friend();
    const hook = renderHook(({ target }) => useMapWave(target), { initialProps: { target } });
    await act(async () => { await hook.result.current.send(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    hook.rerender({ target: { ...target, updated_at: new Date().toISOString(), accessUntil: Date.now() + 15_000 } });
    expect(hook.result.current.message).toBe('Wave sent.'); expect(hook.result.current.cooldownSeconds).toBe(50);
  });
  it('keeps an already confirmed wave across the renewal lease gap for the same selected grant', async () => {
    vi.useFakeTimers(); const target = friend();
    const hook = renderHook(({ target }: { target: LiveFriend | null }) => useMapWave(target, 'profile-bob'), { initialProps: { target } });
    await act(async () => { await hook.result.current.send(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    hook.rerender({ target: null }); expect(hook.result.current.isAvailable).toBe(false);
    hook.rerender({ target: { ...target, accessUntil: Date.now() + 15_000 } });
    expect(hook.result.current.message).toBe('Wave sent.'); expect(hook.result.current.cooldownSeconds).toBe(45);
  });
  it('retires a pending wave across a lease gap and offers confirmation retry after fresh admission', async () => {
    const late = held<ReturnType<typeof receipt>>(); state.send.mockReturnValueOnce(late.promise);
    const target = friend(), hook = renderHook(({ target }: { target: LiveFriend | null }) => useMapWave(target, 'profile-bob'), { initialProps: { target } });
    let task!: Promise<void>; act(() => { task = hook.result.current.send(); });
    hook.rerender({ target: null }); hook.rerender({ target: { ...target, accessUntil: Date.now() + 15_000 } });
    expect(hook.result.current.isPending).toBe(false); expect(hook.result.current.error).toContain('Retry to check');
    await act(async () => { late.resolve(receipt()); await task; }); expect(state.acknowledge).not.toHaveBeenCalled(); expect(hook.result.current.message).toBe('');
    state.send.mockResolvedValue(receipt({ replayed: true }));
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.message).toBe('Your earlier wave was sent.');
  });
  it('does not recover confirmed feedback after a different grant or a real close and reopen', async () => {
    const target = friend(), hook = renderHook(({ target, selected }: { target: LiveFriend | null; selected: string | null }) => useMapWave(target, selected), { initialProps: { target, selected: 'profile-bob' } });
    await act(async () => { await hook.result.current.send(); });
    hook.rerender({ target: { ...target, accessRevision: 'b'.repeat(48) }, selected: 'profile-bob' });
    hook.rerender({ target, selected: 'profile-bob' }); expect(hook.result.current.message).toBe('');
    await act(async () => { await hook.result.current.send(); });
    hook.rerender({ target: null, selected: null }); hook.rerender({ target, selected: 'profile-bob' }); expect(hook.result.current.message).toBe('');
  });
  it.each(['selection', 'selectionABA', 'accountABA', 'revision', 'expired', 'unmount', 'hidden', 'hiddenThenVisible', 'pagehide'] as const)('never accepts a delayed %s completion', async kind => {
    const late = held<ReturnType<typeof receipt>>(); state.send.mockReturnValue(late.promise);
    const target = friend(), hook = renderHook(({ target }) => useMapWave(target), { initialProps: { target } }); let task!: Promise<void>;
    act(() => { task = hook.result.current.send(); }); expect(state.send).toHaveBeenCalledOnce();
    if (kind === 'selection' || kind === 'selectionABA') { hook.rerender({ target: friend('profile-carol') }); if (kind === 'selectionABA') hook.rerender({ target }); }
    if (kind === 'accountABA') { state.uid = 'bob'; state.epoch++; hook.rerender({ target }); state.uid = 'alice'; state.epoch++; hook.rerender({ target }); }
    if (kind === 'revision') hook.rerender({ target: { ...target, accessRevision: 'b'.repeat(48) } });
    if (kind === 'expired') hook.rerender({ target: { ...target, accessUntil: Date.now() - 1 } });
    if (kind === 'unmount') hook.unmount();
    if (kind === 'hidden' || kind === 'hiddenThenVisible') act(() => { visibility('hidden'); if (kind === 'hiddenThenVisible') visibility('visible'); });
    if (kind === 'pagehide') act(() => { window.dispatchEvent(new Event('pagehide')); });
    expect(() => state.send.mock.calls[0][2]()).toThrow();
    await act(async () => { late.resolve(receipt()); await task; }); expect(state.acknowledge).not.toHaveBeenCalled(); expect(hook.result.current.message).toBe('');
  });
  it('allows a fresh selection attempt without an old finally clearing its pending state', async () => {
    const old = held<ReturnType<typeof receipt>>(), fresh = held<ReturnType<typeof receipt>>(); state.send.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const hook = renderHook(({ target }) => useMapWave(target), { initialProps: { target: friend() } }); let first!: Promise<void>, second!: Promise<void>;
    act(() => { first = hook.result.current.send(); }); hook.rerender({ target: friend('profile-carol') });
    act(() => { second = hook.result.current.send(); });
    await act(async () => { old.resolve(receipt()); await first; }); expect(hook.result.current.isPending).toBe(true); expect(state.acknowledge).not.toHaveBeenCalled();
    await act(async () => { fresh.resolve(receipt()); await second; }); expect(hook.result.current.message).toBe('Wave sent.');
  });
  it('exposes a 15-second deadline and suppresses a later successful response', async () => {
    vi.useFakeTimers(); const late = held<ReturnType<typeof receipt>>(); state.send.mockReturnValueOnce(late.promise);
    const hook = renderHook(() => useMapWave(friend())); let task!: Promise<void>;
    act(() => { task = hook.result.current.send(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); await task; });
    expect(hook.result.current.error).toMatch(/too long/); expect(hook.result.current.isPending).toBe(false);
    await act(async () => { late.resolve(receipt()); await Promise.resolve(); }); expect(state.acknowledge).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.send(); }); expect(state.acknowledge).toHaveBeenCalledOnce();
  });
  it('treats server cooldown as a refusal, and an old receipt as an earlier send', async () => {
    state.send.mockRejectedValueOnce(Object.assign(new Error('Please wait'), { cooldownUntil: Date.now() + 30_000 }));
    const hook = renderHook(() => useMapWave(friend()));
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.cooldownSeconds).toBe(30); expect(hook.result.current.message).toBe(''); expect(state.acknowledge).not.toHaveBeenCalled();
    act(() => visibility('hidden')); act(() => visibility('visible'));
    state.send.mockResolvedValue(receipt({ replayed: true, cooldownUntil: Date.now() - 1 }));
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.message).toBe('Your earlier wave was sent.');
  });
  it('does not inherit a prior account success/pending from production QueryClient defaults', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { placeholderData: previous => previous, gcTime: 14 * 86_400_000, staleTime: 60_000, refetchOnMount: false }, mutations: { gcTime: 14 * 86_400_000 } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const hook = renderHook(() => useMapWave(friend()), { wrapper });
    await act(async () => { await hook.result.current.send(); }); expect(hook.result.current.message).toBe('Wave sent.');
    state.uid = 'bob'; state.epoch++; hook.rerender(); expect(hook.result.current.message).toBe(''); expect(hook.result.current.cooldownSeconds).toBe(0);
    state.uid = 'alice'; state.epoch++; hook.rerender(); expect(hook.result.current.message).toBe('');
    expect(client.getMutationCache().getAll()).toHaveLength(0); client.clear();
  });
  it('refuses absent/hidden/expired admission without requiring viewer GPS', async () => {
    const target = friend(), hook = renderHook(({ target }) => useMapWave(target), { initialProps: { target: { ...target, accessUntil: 0 } } });
    expect(hook.result.current.isAvailable).toBe(false); await act(async () => { await hook.result.current.send(); }); expect(state.send).not.toHaveBeenCalled();
    hook.rerender({ target }); expect(hook.result.current.isAvailable).toBe(true);
    act(() => visibility('hidden')); await act(async () => { await hook.result.current.send(); }); expect(state.send).not.toHaveBeenCalled();
    act(() => visibility('visible')); await act(async () => { await hook.result.current.send(); }); await waitFor(() => expect(state.acknowledge).toHaveBeenCalledOnce());
  });
});
