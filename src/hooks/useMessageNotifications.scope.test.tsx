import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, handlers: [] as any[], read: vi.fn(), getUid: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}`, user_id: state.uid }, authReady: true }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => ({ id: `profile-${state.uid}`, user_id: state.uid }), getCachedProfile: (id: string) => ({ id, user_id: id.replace('profile-', '') }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.uid || epoch !== state.epoch) throw Error('Retired'); }; } }));
vi.mock('@/lib/markConversationRead', () => ({ getSessionAuthUid: state.getUid, markConversationReadForViewer: state.read }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: (_name: string, options: any[]) => { state.handlers = options; return {}; }, removeRealtimeChannel: vi.fn() }));
import { useCrossDeviceSync, useInstantReadClear } from './useMessageNotifications';
const clients: QueryClient[] = [];
const row = (time = '2026-11-14T12:00:00.000Z') => ({ id: 'chat', member_ids: ['profile-alice'], members: [{ conversation_id: 'chat', user_id: 'profile-alice' }], unread_count: 2, _hasUnread: true, last_message: { created_at: time } });
function setup() { const client = new QueryClient(); clients.push(client); const key = ['dm-conversations', 'profile-alice', 'alice', 1]; client.setQueryData(key, [row()]); return { client, key, Wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
const emit = (actor: string, date: string) => state.handlers.find(handler => handler.filter === `user_id=eq.${actor}`).callback({ new: { conversation_id: 'chat', user_id: actor, last_read_at: date } });
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.handlers = []; state.read.mockReset().mockResolvedValue(undefined); state.getUid.mockReset().mockResolvedValue('alice'); window.dispatchEvent(new Event('app-resumed')); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
it('accepts legacy UID read receipts without clearing a newer alias copy', () => {
  const { client, key, Wrapper } = setup(), alias = ['conversations', 'alice', 'alice', 1]; client.setQueryData(alias, [row('2026-11-14T12:10:00.000Z')]);
  renderHook(() => useCrossDeviceSync(), { wrapper: Wrapper }); act(() => emit('alice', '2026-11-14T12:05:00.000Z'));
  expect(client.getQueryData<any[]>(key)?.[0].unread_count).toBe(0); expect(client.getQueryData<any[]>(alias)?.[0].unread_count).toBe(2);
});
it('does not mistake older read metadata or malformed message dates for a new read receipt', () => {
  const { client, key, Wrapper } = setup(); renderHook(() => useCrossDeviceSync(), { wrapper: Wrapper });
  act(() => emit('profile-alice', '2026-11-14T11:00:00.000Z')); expect(client.getQueryData<any[]>(key)?.[0].unread_count).toBe(2);
  client.setQueryData(key, [row('invalid')]); act(() => emit('profile-alice', '2026-11-14T12:05:00.000Z')); expect(client.getQueryData<any[]>(key)?.[0].unread_count).toBe(2);
});
it('rejects a retained realtime callback after account retirement', () => {
  const { client, key, Wrapper } = setup(); renderHook(() => useCrossDeviceSync(), { wrapper: Wrapper }); state.epoch = 3;
  act(() => emit('profile-alice', '2026-11-14T12:05:00.000Z')); expect(client.getQueryData<any[]>(key)?.[0].unread_count).toBe(2);
});
it('restores the scoped read clear after rejection while preserving another row delivery', async () => {
  const { client, key, Wrapper } = setup(); client.setQueryData(key, [row(), { ...row(), id: 'other', unread_count: 0 }]); let reject!: (error: Error) => void;
  state.read.mockReturnValue(new Promise((_done, fail) => { reject = fail; })); renderHook(() => useInstantReadClear('chat'), { wrapper: Wrapper });
  await waitFor(() => expect(state.read).toHaveBeenCalledOnce()); client.setQueryData<any[]>(key, rows => rows!.map(item => item.id === 'other' ? { ...item, unread_count: 9 } : item));
  await act(async () => reject(new Error('Denied'))); await waitFor(() => expect(client.getQueryData<any[]>(key)?.[0].unread_count).toBe(2));
  expect(client.getQueryData<any[]>(key)?.[1].unread_count).toBe(9);
});
