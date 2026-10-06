import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ uid: 'alice', profile: 'profile-alice' as string | null, created: '2026-01-01T00:00:00Z', account: { uid: 'alice', epoch: 1 }, listeners: new Set<() => void>(), call: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: state.profile ? { id: state.profile, user_id: state.uid } : null }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.uid, metadata: { creationTime: state.created } } }) }));
vi.mock('firebase/app', () => ({ getApp: () => ({}) }));
vi.mock('firebase/functions', () => ({ getFunctions: () => ({}), httpsCallable: (_fns: unknown, name: string) => (body: unknown) => state.call(name, body) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => state.account,
  reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); },
  reportAccountGuard: (uid: string) => { const epoch = state.account.epoch; return () => {
    if (state.account.uid !== uid || state.account.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' });
  }; },
}));
import { useSetupParentalControls, useUpdateParentalControls, useVerifyParentalPin } from './useParentalControls';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { state.uid = 'alice'; state.profile = 'profile-alice'; state.created = '2026-01-01T00:00:00Z'; state.account = { uid: 'alice', epoch: 1 }; state.call.mockReset(); client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); });
afterEach(() => { cleanup(); client.clear(); });
const change = (uid: string) => { state.uid = uid; state.profile = `profile-${uid}`; state.account = { uid, epoch: state.account.epoch + 1 }; for (const notify of state.listeners) notify(); };

describe('parental PIN proof transport and retirement', () => {
  it('does not send a direct update without an unlock proof', async () => {
    const hook = renderHook(() => useUpdateParentalControls(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ is_active: false })).rejects.toThrow('Unlock'); });
    expect(state.call).not.toHaveBeenCalled();
  });
  it('sends the current PIN and captured owner only for a matching epoch', async () => {
    state.call.mockResolvedValue({ data: { ok: true } });
    const hook = renderHook(() => useUpdateParentalControls({ pin: '1234', uid: 'alice', epoch: 1 }), { wrapper });
    await act(async () => { await hook.result.current.mutateAsync({ max_screen_time_minutes: 60 }); });
    expect(state.call).toHaveBeenCalledExactlyOnceWith('updateParentalControls', { expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse('2026-01-01T00:00:00Z'), pin: '1234', updates: { max_screen_time_minutes: 60 } });
    const options = client.getMutationCache().getAll()[0]?.options;
    expect(options).toMatchObject({ retry: false, networkMode: 'always', gcTime: 0 });
  });
  it('rejects the previous proof after the same UID returns in a new epoch', async () => {
    const hook = renderHook(() => useUpdateParentalControls({ pin: '1234', uid: 'alice', epoch: 1 }), { wrapper });
    change('alice'); hook.rerender();
    await act(async () => { await expect(hook.result.current.mutateAsync({ is_active: false })).rejects.toThrow('Unlock'); });
    expect(state.call).not.toHaveBeenCalled();
  });
  it('does not accept a late verification result for a replaced account', async () => {
    let resolve!: (value: unknown) => void; state.call.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useVerifyParentalPin(), { wrapper });
    let pending!: Promise<boolean>; await act(async () => { pending = hook.result.current.mutateAsync('1234'); });
    expect(state.call).toHaveBeenCalledWith('verifyParentalPin', { pin: '1234', expectedOwnerUid: 'alice', expectedProfileId: 'profile-alice', expectedAccountCreatedAt: Date.parse('2026-01-01T00:00:00Z') });
    change('bob');
    await act(async () => { resolve({ data: { ok: true } }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
  });
  it('does not write a late setup result into a replaced account cache', async () => {
    let resolve!: (value: unknown) => void; state.call.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useSetupParentalControls(), { wrapper });
    let pending!: Promise<unknown>; await act(async () => { pending = hook.result.current.mutateAsync({ pin: '1234' }); });
    change('bob');
    await act(async () => { resolve({ data: { controls: { user_id: 'alice', has_pin: true } } }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(client.getQueryData(['parental-controls', 'bob', 2])).toBeUndefined();
    expect(client.getQueryData(['parental-controls', 'alice', 1])).toBeUndefined();
  });
  it('retires the proof when the server rejects an old PIN or a shared lockout', async () => {
    const expired = vi.fn(); state.call.mockRejectedValue(Object.assign(new Error('Rejected'), { code: 'functions/permission-denied' }));
    const hook = renderHook(() => useUpdateParentalControls({ pin: '1234', uid: 'alice', epoch: 1 }, expired), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ is_active: false })).rejects.toThrow('Rejected'); });
    expect(expired).toHaveBeenCalledOnce(); expect(state.call).toHaveBeenCalledOnce();
  });
  it('rejects late results after Auth creation metadata changes for the same UID', async () => {
    let resolve!: (value: unknown) => void; state.call.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(() => useVerifyParentalPin(), { wrapper }); let pending!: Promise<boolean>;
    await act(async () => { pending = hook.result.current.mutateAsync('1234'); }); state.created = '2026-02-01T00:00:00Z';
    await act(async () => { resolve({ data: { ok: true } }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
  });
  it('does not issue a request before its matching profile is ready', async () => {
    state.profile = null; const hook = renderHook(() => useVerifyParentalPin(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync('1234')).rejects.toThrow('verified profile'); }); expect(state.call).not.toHaveBeenCalled();
  });

  it('retries an unknown setup outcome using the same request ID and original details', async () => {
    state.call.mockRejectedValueOnce(Object.assign(new Error('Response lost'), { code: 'functions/unavailable' })).mockImplementation(async (_name, body) => ({ data: { ok: true, requestId: body.requestId, replayed: true, controls: { user_id: 'alice', has_pin: true } } }));
    const hook = renderHook(() => useSetupParentalControls(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ pin: '1234', settings: { max_screen_time_minutes: 90 } })).rejects.toThrow('Response lost'); });
    await act(async () => { await hook.result.current.mutateAsync({ pin: '1234', settings: { max_screen_time_minutes: 90 } }); });
    expect(state.call.mock.calls[1][1]).toEqual(state.call.mock.calls[0][1]);
    expect(state.call.mock.calls[0][1].requestId).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('does not turn an unresolved setup into a new request with different settings', async () => {
    state.call.mockRejectedValue(new Error('Offline')); const hook = renderHook(() => useSetupParentalControls(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ pin: '1234' })).rejects.toThrow('Offline'); });
    await act(async () => { await expect(hook.result.current.mutateAsync({ pin: '5678' })).rejects.toThrow('original setup'); }); expect(state.call).toHaveBeenCalledOnce();
  });
  it('keeps an incomplete confirmation retry bound to its original request', async () => {
    state.call.mockResolvedValue({ data: { ok: true, requestId: 'wrong', replayed: false, controls: { user_id: 'alice', has_pin: true } } });
    const hook = renderHook(() => useSetupParentalControls(), { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync({ pin: '1234' })).rejects.toThrow('incomplete'); });
    await act(async () => { await expect(hook.result.current.mutateAsync({ pin: '1234' })).rejects.toThrow('incomplete'); });
    expect(state.call.mock.calls[0][1].requestId).toEqual(state.call.mock.calls[1][1].requestId);
  });

});
