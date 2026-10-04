import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'alice-profile', user_id: 'alice', username: 'alice' }, insert: vi.fn(), send: vi.fn(), sender: vi.fn(), broadcast: vi.fn(), warning: vi.fn(), channels: [] as { callback: (payload: any) => Promise<void> }[], nativeCallbacks: [] as ((payload: any) => void)[] }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session,
  reportAccountGuard: (expected: string) => { const captured = state.session; return () => { if (!expected || state.session.uid !== expected || captured.epoch !== state.session.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; } }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: {} }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => table === 'screenshot_notifications' ? { insert: state.insert } : { select: () => ({ eq: () => ({ single: state.sender }) }) } } }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => null, getCachedProfile: () => null }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: state.send }));
vi.mock('@/lib/dmBroadcast', () => ({ prewarmDmBroadcastChannel: vi.fn(), sendDmBroadcastScreenshot: state.broadcast, subscribeDmBroadcastScreenshot: (_cid: string, callback: (payload: any) => void) => { state.nativeCallbacks.push(callback); return vi.fn(); } }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: (_topic: string, handlers: any[]) => { state.channels.push(...handlers); return {}; }, removeRealtimeChannel: vi.fn() }));
vi.mock('@/lib/haptics', () => ({ haptics: { warning: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { warning: state.warning, info: vi.fn() } }));
import { useScreenshotNotification } from './useMessages';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };
function context() { const client = new QueryClient(); return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => {
  state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.profile = { id: 'alice-profile', user_id: 'alice', username: 'alice' };
  state.insert.mockReset().mockResolvedValue({ error: null }); state.send.mockReset().mockResolvedValue({ data: { id: 'notice' }, error: null }); state.sender.mockReset().mockResolvedValue({ data: { username: 'bob' } });
  state.broadcast.mockReset().mockResolvedValue(undefined); state.warning.mockReset(); state.channels = []; state.nativeCallbacks = [];
});

describe('capture notices are bound to the initiating account and view', () => {
  it('sends a normal current-account capture with an explicit guarded canonical send', async () => {
    const env = context(); const invalidate = vi.spyOn(env.client, 'invalidateQueries'); const hook = renderHook(() => useScreenshotNotification('room'), env);
    await act(async () => { await hook.result.current.notifyScreenshot(); });
    expect(state.insert).toHaveBeenCalledWith({ conversation_id: 'room', user_id: 'alice-profile' });
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: 'room', sender_id: 'alice-profile', message_type: 'screenshot_notification' }), { accountGuard: expect.any(Function) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: messagesQueryKey('room', state.session), exact: true }); hook.unmount(); env.client.clear();
  });
  it.each([false, true])('stops before canonical send when recording the capture crosses accounts (ABA=%s)', async returning => {
    const reply = deferred<any>(); state.insert.mockReturnValue(reply.promise); const env = context(); const hook = renderHook(() => useScreenshotNotification('room'), env);
    let pending!: Promise<void>; act(() => { pending = hook.result.current.notifyScreenshot(); });
    state.session = returning ? { uid: 'alice', epoch: 3 } : { uid: 'bob', epoch: 2 }; hook.rerender();
    await act(async () => { reply.resolve({ error: null }); await pending; });
    expect(state.send).not.toHaveBeenCalled(); expect(state.broadcast).toHaveBeenCalledTimes(1); hook.unmount(); env.client.clear();
  });
  it('rejects stale rendered profile identity even with a freshly captured native account', async () => {
    state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' };
    const env = context(); const hook = renderHook(() => useScreenshotNotification('room'), env);
    await hook.result.current.notifyScreenshot();
    expect(state.insert).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled(); expect(state.broadcast).not.toHaveBeenCalled(); expect(state.channels).toHaveLength(0);
    hook.unmount(); env.client.clear();
  });
  it('suppresses delayed sender lookups and native callbacks after unmount', async () => {
    const reply = deferred<any>(); state.sender.mockReturnValue(reply.promise); const env = context(); const hook = renderHook(() => useScreenshotNotification('room'), env);
    const oldNative = state.nativeCallbacks[0]; const pending = state.channels[0].callback({ new: { id: 'capture', user_id: 'bob-profile', created_at: new Date().toISOString() } });
    hook.unmount(); reply.resolve({ data: { username: 'bob-private' } }); await pending;
    oldNative({ id: 'native', userId: 'bob-profile', captureType: 'screenshot', username: 'bob-private', timestamp: new Date().toISOString() });
    expect(state.warning).not.toHaveBeenCalled(); env.client.clear();
  });
  it('does not display old native events after the same account changes conversations', () => {
    const env = context(); const hook = renderHook(({ cid }) => useScreenshotNotification(cid), { ...env, initialProps: { cid: 'first' } }); const oldNative = state.nativeCallbacks[0];
    hook.rerender({ cid: 'second' });
    act(() => oldNative({ id: 'native', userId: 'bob-profile', captureType: 'screenshot', username: 'old-room-peer', timestamp: new Date().toISOString() }));
    expect(state.warning).not.toHaveBeenCalled(); expect(hook.result.current.screenshotEvents).toEqual([]); hook.unmount(); env.client.clear();
  });
});
