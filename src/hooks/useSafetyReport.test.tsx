import { webcrypto } from 'node:crypto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice' as string | null, reactUid: 'alice' as string | null, listener: null as null | ((user: { uid: string } | null) => void), invoke: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return state.uid ? { uid: state.uid } : null; }, onAuthStateChanged: (listener: typeof state.listener) => { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.reactUid ? { id: state.reactUid } : null }) }));
import { useSafetyReport } from './useSafetyReport';
const input = { targetType: 'post' as const, targetId: 'post-1', reason: 'spam' };
const ack = { data: { success: true, reportId: 'confirmed', status: 'pending' } };
function switchTo(uid: string) { state.uid = uid; state.reactUid = uid; state.listener?.({ uid }); }
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); state.invoke.mockReset(); switchTo('alice'); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('report forms are bound to their mounted account and target', () => {
  it('requires the rendered React account, even if native Firebase is already signed in', async () => {
    state.reactUid = null;
    const { result } = renderHook(() => useSafetyReport('post-1'));
    await expect(result.current(input)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.invoke).not.toHaveBeenCalled();
    expect(result.current.isCurrent()).toBe(false);
  });
  it.each(['account', 'roundtrip', 'target', 'unmount'])('rejects pending completion after %s changes', async change => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, rerender, unmount } = renderHook(({ target }) => useSafetyReport(target), { initialProps: { target: 'post-1' } });
    const original = result.current;
    const pending = original(input);
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    if (change === 'account' || change === 'roundtrip') { switchTo('bob'); if (change === 'roundtrip') switchTo('alice'); rerender({ target: 'post-1' }); }
    if (change === 'target') rerender({ target: 'post-2' });
    if (change === 'unmount') unmount();
    expect(original.isCurrent()).toBe(false);
    await act(async () => { resolve(ack); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    if (change !== 'unmount') expect(result.current.isCurrent()).toBe(true);
  });
  it('keeps a new account request pending when the previous account response finishes', async () => {
    const resolvers: ((value: unknown) => void)[] = [];
    state.invoke.mockImplementation(() => new Promise(done => { resolvers.push(done); }));
    const { result, rerender } = renderHook(() => useSafetyReport('post-1'));
    const previous = result.current;
    let newRequestBusy = true;
    const old = previous(input).catch(() => {}).finally(() => { if (previous.isCurrent()) newRequestBusy = false; });
    await waitFor(() => expect(resolvers).toHaveLength(1));
    switchTo('bob'); rerender();
    const fresh = result.current(input);
    await waitFor(() => expect(resolvers).toHaveLength(2));
    await act(async () => { resolvers[0](ack); await old; });
    expect(newRequestBusy).toBe(true);
    await act(async () => { resolvers[1](ack); await fresh; });
  });
  it('allows a confirmed response for the same mounted account', async () => {
    state.invoke.mockResolvedValue(ack);
    const { result } = renderHook(() => useSafetyReport('post-1'));
    await expect(result.current(input)).resolves.toMatchObject({ success: true, reportId: 'confirmed' });
  });
});
