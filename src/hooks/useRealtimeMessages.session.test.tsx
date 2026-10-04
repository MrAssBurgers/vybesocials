import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, profile: { id: 'alice-profile', user_id: 'alice' }, channels: [] as { handlers: { callback: (payload: any) => void }[] }[], broadcasts: [] as ((message: any) => void)[], apply: vi.fn(), setup: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.session.uid }, profile: state.profile }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountGuard: () => { const captured = state.session; return () => { if (captured !== state.session) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => null, getCachedProfile: () => null }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: (_topic: string, handlers: any[]) => { const channel = { handlers }; state.channels.push(channel); return channel; }, removeRealtimeChannel: state.remove, removeChannelByTopic: vi.fn() }));
vi.mock('@/lib/dmBroadcast', () => ({ subscribeDmBroadcastMessages: (_id: string, callback: (message: any) => void) => { state.broadcasts.push(callback); return vi.fn(); } }));
vi.mock('@/lib/dmScopedMessageRealtime', () => ({ applyBroadcastMessage: state.apply, setupScopedMessageRealtime: state.setup }));
import { useRealtimeMessages } from './useRealtimeMessages';
import { useGlobalRealtimeMessages, setCurrentConversationId } from './useGlobalRealtimeMessages';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { dmListQueryKey } from '@/lib/dmAccountScope';
function context() { const client = new QueryClient(); return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => { state.session = { uid: 'alice', epoch: 1 }; state.profile = { id: 'alice-profile', user_id: 'alice' }; state.channels = []; state.broadcasts = []; state.apply.mockReset(); state.remove.mockReset(); state.setup.mockReset().mockImplementation(() => ({ teardown: vi.fn(), resync: vi.fn() })); setCurrentConversationId(null); });

describe('private realtime hook account boundaries', () => {
  it('invalidates only the current session thread when a known message changes', () => {
    const env = context(); const key = messagesQueryKey('room', state.session); env.client.setQueryData(key, [{ id: 'm' }]);
    const invalidate = vi.spyOn(env.client, 'invalidateQueries'); const hook = renderHook(() => useRealtimeMessages('room'), env);
    act(() => state.channels[0].handlers[0].callback({ new: { message_id: 'm' } }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key, exact: true });
    invalidate.mockClear(); const old = state.channels[0]; state.session = { uid: 'alice', epoch: 3 }; hook.rerender();
    act(() => old.handlers[1].callback({ new: { message_id: 'm' } }));
    expect(invalidate).not.toHaveBeenCalled(); hook.unmount(); env.client.clear();
  });
  it('does not use ownerless or foreign disk profile IDs for private subscriptions', () => {
    state.profile = { id: 'bob-profile', user_id: 'bob' }; const env = context();
    const hook = renderHook(() => { useRealtimeMessages('room'); useGlobalRealtimeMessages(); }, env);
    expect(state.channels).toHaveLength(0); expect(state.setup).not.toHaveBeenCalled(); hook.unmount(); env.client.clear();
  });
  it('retains a captured global context and suppresses old broadcast callbacks after ABA', () => {
    setCurrentConversationId('room'); const env = context();
    env.client.setQueryData(dmListQueryKey('alice-profile', state.session), [{ id: 'room', member_ids: ['alice-profile', 'bob-profile'] }]);
    const hook = renderHook(useGlobalRealtimeMessages, env); const old = state.broadcasts[0]; const captured = state.setup.mock.calls[0][0];
    act(() => old({ id: 'm', conversation_id: 'room', sender_id: 'bob-profile' })); expect(state.apply).toHaveBeenCalledOnce();
    state.apply.mockClear(); state.session = { uid: 'alice', epoch: 3 }; hook.rerender();
    act(() => old({ id: 'late', conversation_id: 'room', sender_id: 'bob-profile' }));
    expect(state.apply).not.toHaveBeenCalled(); expect(captured.accountSession.epoch).toBe(1);
    hook.unmount(); env.client.clear();
  });
  it('rejects native broadcasts without current-session membership or with the wrong conversation', () => {
    setCurrentConversationId('room'); const env = context();
    env.client.setQueryData(['dm-conversations', 'alice-profile'], [{ id: 'room', member_ids: ['alice-profile'] }]);
    const hook = renderHook(useGlobalRealtimeMessages, env);
    act(() => state.broadcasts[0]({ id: 'm', conversation_id: 'room', sender_id: 'bob-profile' }));
    expect(state.apply).not.toHaveBeenCalled();
    env.client.setQueryData(dmListQueryKey('alice-profile', state.session), [{ id: 'room', member_ids: ['alice-profile'] }]);
    act(() => state.broadcasts[0]({ id: 'm2', conversation_id: 'different-room', sender_id: 'bob-profile' }));
    expect(state.apply).not.toHaveBeenCalled(); hook.unmount(); env.client.clear();
  });
});
