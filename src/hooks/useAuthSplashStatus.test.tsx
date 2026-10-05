import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ get: vi.fn(), hint: true, phase: 'pending', mark: vi.fn(), listener: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { auth: { getSession: state.get, onAuthStateChange: (listener: typeof state.listener) => { state.listener = listener; return { data: { subscription: { unsubscribe: state.unsubscribe } } }; } } } }));
vi.mock('@/lib/firebase/authService', () => ({ getAuthRestoreState: () => state.phase }));
vi.mock('@/lib/legacyAuthStorage', () => ({ hasStoredAuthSession: () => state.hint }));
vi.mock('@/lib/wasLoggedIn', () => ({ setWasLoggedIn: state.mark }));
import { useAuthSplashStatus } from './useAuthSplashStatus';
beforeEach(() => { vi.clearAllMocks(); state.phase = 'pending'; state.hint = true; state.listener = null; state.get.mockReturnValue(new Promise(() => {})); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('launch splash and saved login hint', () => {
  it('lets the launch animation finish without erasing a pending native login', async () => {
    vi.useFakeTimers(); const hook = renderHook(() => useAuthSplashStatus(false, true));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); }); expect(hook.result.current.authResolved).toBe(true);
    expect(state.mark).not.toHaveBeenCalledWith(false); expect(hook.result.current.hasSession).toBe(true);
  });
  it.each(['auth/restore-pending', 'auth/restore-unavailable'])('does not clear saved login for %s', async name => {
    state.get.mockResolvedValue({ data: { session: null }, error: { name } }); const hook = renderHook(() => useAuthSplashStatus(true, true));
    await waitFor(() => expect(state.get).toHaveBeenCalled()); expect(state.mark).not.toHaveBeenCalledWith(false); expect(hook.result.current.hasSession).toBe(true);
  });
  it('ignores provisional null but accepts authoritative empty after settling', async () => {
    renderHook(() => useAuthSplashStatus(true, true)); act(() => state.listener?.('INITIAL_SESSION', null)); expect(state.mark).not.toHaveBeenCalledWith(false);
    state.phase = 'ready'; act(() => state.listener?.('INITIAL_SESSION', null)); expect(state.mark).toHaveBeenLastCalledWith(false);
  });
  it('accepts checked signed in and explicit signed out callbacks and unsubscribes', () => {
    const hook = renderHook(() => useAuthSplashStatus(false, true)); state.phase = 'ready'; act(() => state.listener?.('SIGNED_IN', { user: { id: 'alice' } })); expect(hook.result.current.hasSession).toBe(true);
    act(() => state.listener?.('SIGNED_OUT', null)); expect(hook.result.current.hasSession).toBe(false); hook.unmount(); expect(state.unsubscribe).toHaveBeenCalledOnce();
  });
  it('does not overwrite a newer sign-in event with an older empty initial read', async () => {
    let resolve!: (value: unknown) => void; state.get.mockReturnValue(new Promise(r => { resolve = r; }));
    const hook = renderHook(() => useAuthSplashStatus(false, true)); state.phase = 'ready';
    act(() => state.listener?.('SIGNED_IN', { user: { id: 'alice' } }));
    await act(async () => resolve({ data: { session: null }, error: null }));
    expect(hook.result.current.hasSession).toBe(true); expect(state.mark).not.toHaveBeenCalledWith(false);
  });
});
