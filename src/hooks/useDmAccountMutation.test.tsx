import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, binding: null as string | null, call: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: state.binding || `profile-${state.uid}`, user_id: state.uid }, authReady: true }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => ({ id: state.binding || `profile-${state.uid}`, user_id: state.uid }), getCachedProfile: (id: string) => ({ id, user_id: id.replace('profile-', '') }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }), reportAccountGuard: (uid: string) => { const epoch = state.epoch; return () => { if (uid !== state.uid || epoch !== state.epoch) throw Error('Retired account'); }; } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/lib/dmMembershipRepair', () => ({ fetchMemberProfiles: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => {
  let action = '', body: unknown; const filters: unknown[] = [];
  const q: any = { select: () => { action = 'select'; return q; }, in: () => q, maybeSingle: () => q, delete: () => { action = 'delete'; return q; }, upsert: (value: unknown) => { action = 'upsert'; body = value; return q; },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return q; }, then: (resolve: any, reject: any) => Promise.resolve(state.call({ table, action, body, filters })).then(resolve, reject) }; return q;
} } }));
import { useDmAccountMutation } from './useDmAccountMutation';
import { useTrashConversation, useTrashedConversations } from './useTrashedConversations';
const clients: QueryClient[] = [];
function wrapper() { const client = new QueryClient(); clients.push(client); return { client, Wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.binding = null; state.call.mockReset().mockResolvedValue({ data: [], error: null }); state.success.mockReset(); state.error.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
it('captures input before asynchronous optimism and preserves public callback arguments', async () => {
  const { Wrapper } = wrapper(); let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); const write = vi.fn(async () => 'ack'); const callback = vi.fn();
  const hook = renderHook(({ label }) => useDmAccountMutation({ capture: (id: string) => ({ id, label }), onMutate: () => gate,
    mutationFn: async operation => { write(operation.value, operation.actor.profileId); return 'ack'; } }), { wrapper: Wrapper, initialProps: { label: 'original' } });
  let pending!: Promise<unknown>; act(() => { pending = hook.result.current.mutateAsync('chat', { onSuccess: callback }); });
  hook.rerender({ label: 'replacement' }); await act(async () => { finish(); await pending; });
  expect(write).toHaveBeenCalledWith({ id: 'chat', label: 'original' }, 'profile-alice');
  expect(callback.mock.calls[0][1]).toBe('chat');
});
it('retires a queued mutation before dispatch after the account leaves and returns', async () => {
  const { Wrapper } = wrapper(); let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); const write = vi.fn(); const callback = vi.fn();
  const hook = renderHook(() => useDmAccountMutation({ capture: (id: string) => id, onMutate: () => gate, mutationFn: write, onError: callback }), { wrapper: Wrapper });
  let pending!: Promise<unknown>; act(() => { pending = hook.result.current.mutateAsync('chat', { onError: callback }).catch(error => error); });
  state.uid = 'bob'; state.epoch = 2; hook.rerender(); state.uid = 'alice'; state.epoch = 3; hook.rerender();
  await act(async () => { finish(); await pending; }); expect(write).not.toHaveBeenCalled(); expect(callback).not.toHaveBeenCalled();
});
it('does not dispatch the second trash write after retirement during the first write', async () => {
  const { Wrapper } = wrapper(); let finish!: (value: unknown) => void;
  state.call.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useTrashConversation(), { wrapper: Wrapper }); let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.mutateAsync('chat').catch(error => error); }); await waitFor(() => expect(state.call).toHaveBeenCalledTimes(1));
  expect(state.call.mock.calls[0][0]).toMatchObject({ table: 'hidden_conversations', action: 'delete' });
  state.uid = 'bob'; state.epoch = 2; hook.rerender(); state.uid = 'alice'; state.epoch = 3; hook.rerender();
  await act(async () => { finish({ error: null }); await pending; });
  expect(state.call).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
});
it('retires pending work when the confirmed profile binding changes within one account', async () => {
  const { Wrapper } = wrapper(); let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); const write = vi.fn();
  const hook = renderHook(() => useDmAccountMutation({ capture: (id: string) => id, onMutate: () => gate, mutationFn: write }), { wrapper: Wrapper });
  let pending!: Promise<unknown>; act(() => { pending = hook.result.current.mutateAsync('chat').catch(error => error); });
  state.binding = 'rebound-profile'; hook.rerender(); await act(async () => { finish(); await pending; }); expect(write).not.toHaveBeenCalled();
});
it('stops and restores scoped optimism if the first trash write is rejected', async () => {
  const { client, Wrapper } = wrapper(); const key = ['dm-conversations', 'profile-alice', 'alice', 1];
  const row = { id: 'chat', member_ids: ['profile-alice'], members: [] }; client.setQueryData(key, [row]);
  state.call.mockResolvedValue({ error: new Error('Rejected') }); const hook = renderHook(() => useTrashConversation(), { wrapper: Wrapper });
  await act(async () => { await hook.result.current.mutateAsync('chat').catch(() => {}); });
  expect(state.call).toHaveBeenCalledTimes(1); expect(client.getQueryData(key)).toEqual([row]); expect(state.success).not.toHaveBeenCalled();
});
it('does not touch another account after a pending query cancellation', async () => {
  const { client, Wrapper } = wrapper(); let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; });
  vi.spyOn(client, 'cancelQueries').mockReturnValueOnce(gate); const hook = renderHook(() => useTrashConversation(), { wrapper: Wrapper }); let pending!: Promise<unknown>;
  act(() => { pending = hook.result.current.mutateAsync('chat').catch(error => error); });
  await waitFor(() => expect(client.cancelQueries).toHaveBeenCalled()); state.uid = 'bob'; state.epoch = 2; hook.rerender();
  const key = ['dm-conversations', 'profile-bob', 'bob', 2]; client.setQueryData(key, [{ id: 'bob-chat' }]);
  await act(async () => { finish(); await pending; }); expect(state.call).not.toHaveBeenCalled(); expect(client.getQueryData(key)).toEqual([{ id: 'bob-chat' }]);
});

it('does not restore an embedded legacy conversation after current parent access is denied', async () => {
  const { Wrapper } = wrapper();
  state.call.mockImplementation(({ table }) => Promise.resolve(table === 'trashed_conversations'
    ? { data: [{ id: 'trash', user_id: 'profile-alice', conversation_id: 'chat', trashed_at: '2026-11-14T12:00:00.000Z', auto_delete_at: null,
        conversation: { id: 'chat', name: 'Old private snapshot', members: [] } }], error: null }
    : { data: table === 'conversations' ? null : [], error: table === 'conversations' ? new Error('Denied') : null }));
  const hook = renderHook(() => useTrashedConversations(), { wrapper: Wrapper });
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(hook.result.current.data?.[0].conversation).toBeUndefined();
});
