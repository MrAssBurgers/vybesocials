import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveFriend } from '@/lib/vybemap/types';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, create: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}` }, session: { epoch }, ready: !!uid,
    guard: () => { if (!uid || uid !== state.uid || epoch !== state.epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/firebase/chats', () => ({ createDmChat: (...args: unknown[]) => state.create(...args) }));
import { useMapFriendChat } from './useMapFriendChat';
function held<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
const friend = (id = 'profile-bob'): LiveFriend => ({ id: `sample-${id}`, user_id: id, latitude: 0, longitude: 0, label: null, updated_at: new Date().toISOString(), expires_at: null, sharing_enabled: true, accessRevision: 'grant-revision', accessUntil: Date.now() + 30_000 });
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch++; state.create.mockResolvedValue('alice_bob'); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('selected map friend chat', () => {
  it('opens the selected friend conversation once for duplicate taps', async () => {
    const late = held<string>(); state.create.mockReturnValue(late.promise);
    const onOpen = vi.fn(); const hook = renderHook(() => useMapFriendChat(friend(), onOpen));
    let first!: Promise<void>;
    act(() => { first = hook.result.current.open(); void hook.result.current.open(); });
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    expect(state.create.mock.calls[0][0]).toBe('profile-bob'); expect(hook.result.current.isPending).toBe(true);
    await act(async () => { late.resolve('alice_bob'); await first; });
    expect(onOpen).toHaveBeenCalledExactlyOnceWith('alice_bob'); expect(hook.result.current.isPending).toBe(false);
  });
  it('retires departed selection work across A-B-A and allows a fresh attempt', async () => {
    const late = held<string>(), fresh = held<string>(); state.create.mockReturnValueOnce(late.promise).mockReturnValueOnce(fresh.promise);
    const onOpen = vi.fn(); const hook = renderHook(({ target }) => useMapFriendChat(target, onOpen), { initialProps: { target: friend() } });
    let old!: Promise<void>, next!: Promise<void>;
    act(() => { old = hook.result.current.open(); }); await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    hook.rerender({ target: friend('profile-carol') }); hook.rerender({ target: friend() });
    expect(hook.result.current.isPending).toBe(false);
    act(() => { next = hook.result.current.open(); }); await waitFor(() => expect(state.create).toHaveBeenCalledTimes(2));
    await act(async () => { late.resolve('obsolete'); await old; });
    expect(onOpen).not.toHaveBeenCalled(); expect(hook.result.current.isPending).toBe(true);
    await act(async () => { fresh.resolve('fresh'); await next; }); expect(onOpen).toHaveBeenCalledExactlyOnceWith('fresh');
  });
  it.each(['account', 'unmount', 'revision', 'expired'] as const)('retires delayed results on %s changes', async kind => {
    const late = held<string>(); state.create.mockReturnValue(late.promise); const onOpen = vi.fn();
    const target = friend(); const hook = renderHook(({ target }) => useMapFriendChat(target, onOpen), { initialProps: { target } });
    let task!: Promise<void>; act(() => { task = hook.result.current.open(); });
    await waitFor(() => expect(state.create).toHaveBeenCalledOnce());
    if (kind === 'account') { state.uid = 'other'; state.epoch++; hook.rerender({ target }); }
    if (kind === 'unmount') hook.unmount();
    if (kind === 'revision') hook.rerender({ target: { ...target, accessRevision: 'new-revision' } });
    if (kind === 'expired') hook.rerender({ target: { ...target, accessUntil: Date.now() - 1 } });
    expect(() => state.create.mock.calls[0][1]()).toThrow();
    await act(async () => { late.resolve('obsolete'); await task; }); expect(onOpen).not.toHaveBeenCalled();
  });
  it('exposes a retry after a deadline and rejects a late completion', async () => {
    vi.useFakeTimers(); const late = held<string>(); state.create.mockReturnValueOnce(late.promise); const onOpen = vi.fn();
    const hook = renderHook(() => useMapFriendChat(friend(), onOpen)); let task!: Promise<void>;
    await act(async () => { task = hook.result.current.open(); await vi.advanceTimersByTimeAsync(1); });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); await task; });
    expect(hook.result.current.error).toMatch(/took too long/); expect(hook.result.current.isPending).toBe(false);
    await act(async () => { late.resolve('obsolete'); await Promise.resolve(); }); expect(onOpen).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.open(); }); expect(onOpen).toHaveBeenCalledExactlyOnceWith('alice_bob');
  });
  it('rejects unavailable friends and malformed conversation replies', async () => {
    const onOpen = vi.fn(); const hook = renderHook(({ target }) => useMapFriendChat(target, onOpen), { initialProps: { target: { ...friend(), accessUntil: 0 } } });
    await act(async () => { await hook.result.current.open(); }); expect(state.create).not.toHaveBeenCalled(); expect(hook.result.current.error).toMatch(/Refresh/);
    hook.rerender({ target: friend() }); state.create.mockResolvedValue('not/a/conversation');
    await act(async () => { await hook.result.current.open(); }); expect(onOpen).not.toHaveBeenCalled(); expect(hook.result.current.error).toMatch(/confirmed/);
  });
});
