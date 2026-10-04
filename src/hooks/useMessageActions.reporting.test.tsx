import { webcrypto } from 'node:crypto';
import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice' as string | null, reactUid: 'alice' as string | null, listener: null as null | ((user: { uid: string } | null) => void), invoke: vi.fn(), from: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return state.uid ? { uid: state.uid } : null; }, onAuthStateChanged: (listener: typeof state.listener) => { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.reactUid ? { id: state.reactUid } : null, profile: { id: 'legacy-profile' } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from, rpc: state.rpc } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { useReportMessage } from './useMessageActions';
const acknowledgement = { data: { success: true, reportId: 'message-report', status: 'pending' } };
const input = { messageId: 'exact-message', reason: 'harassment' };
const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } }); clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(({ target }) => useReportMessage(target), { wrapper, initialProps: { target: 'conversation-a:exact-message' } });
}
function switchTo(uid: string | null) { state.uid = uid; state.reactUid = uid; state.listener?.(uid ? { uid } : null); }
beforeEach(() => { vi.stubGlobal('crypto', webcrypto); vi.clearAllMocks(); state.invoke.mockReset(); switchTo('alice'); sessionStorage.clear(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('verified message reports', () => {
  it('submits only identity/reason and acknowledges an actual receipt without client private reads or logs', async () => {
    state.invoke.mockResolvedValue(acknowledgement);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {}); const debug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const hook = setup();
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(state.invoke).toHaveBeenCalledWith('report-moderation', { action: 'submit', targetType: 'message', targetId: input.messageId, reason: input.reason, requestId: expect.any(String) });
    expect(state.success).toHaveBeenCalledExactlyOnceWith('Message report submitted.');
    expect(state.from).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled(); expect(debug).not.toHaveBeenCalled();
  });
  it('rejects failures and retries the same receipt without a false success', async () => {
    state.invoke.mockResolvedValueOnce({ error: { code: 'unavailable', message: 'Try again' } }).mockResolvedValueOnce(acknowledgement);
    const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync(input)).rejects.toThrow('Try again'); });
    expect(state.success).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.mutateAsync(input); });
    expect(state.invoke.mock.calls[1][1].requestId).toBe(state.invoke.mock.calls[0][1].requestId);
    expect(state.success).toHaveBeenCalledTimes(1);
  });
  it('requires rendered authentication and a durable message identity', async () => {
    state.reactUid = null;
    const hook = setup();
    await act(async () => { await expect(hook.result.current.mutateAsync(input)).rejects.toMatchObject({ code: 'account-changed' }); });
    state.reactUid = 'alice'; hook.rerender({ target: 'conversation-a:exact-message' });
    await act(async () => { await expect(hook.result.current.mutateAsync({ ...input, messageId: 'temp-pending' })).rejects.toThrow('finished sending'); });
    expect(state.invoke).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled();
  });
  it.each(['account', 'aba', 'target', 'unmount'])('does not acknowledge a late completion after %s change', async change => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = setup();
    const pending = hook.result.current.mutateAsync(input);
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    if (change === 'account' || change === 'aba') { switchTo('bob'); if (change === 'aba') switchTo('alice'); hook.rerender({ target: 'conversation-a:exact-message' }); }
    if (change === 'target') hook.rerender({ target: 'conversation-b:other-message' });
    if (change === 'unmount') hook.unmount();
    await act(async () => { resolve(acknowledgement); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
});
