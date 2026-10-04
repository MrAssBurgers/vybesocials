import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((user: { uid: string }) => void), read: vi.fn(), write: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}`, user_id: state.uid } }) }));
vi.mock('@/lib/firebase', () => ({ db: { rpc: state.rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: state.read }) }), update: () => ({ eq: state.write }), upsert: state.write }) } }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
vi.mock('@/lib/invalidateConversationCaches', () => ({ invalidateConversationCaches: vi.fn() }));
import { useDeleteForMe, useEditMessage, useUnsendForEveryone } from './useMessageActions';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { reportAccountSnapshot } from '@/lib/reportModerationService';

const clients: QueryClient[] = [];
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } }); clients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => ({ unsend: useUnsendForEveryone(), remove: useDeleteForMe(), edit: useEditMessage() }), { wrapper });
  return { ...hook, client };
}
function switchTo(uid: string) { state.uid = uid; state.listener?.({ uid }); }
beforeEach(() => {
  switchTo('alice'); reportAccountSnapshot(); vi.clearAllMocks();
  state.read.mockReset().mockResolvedValue({ data: { sender_id: 'profile-alice', conversation_id: 'cid', created_at: new Date().toISOString() }, error: null });
  state.write.mockReset().mockResolvedValue({ error: null }); state.rpc.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe('message mutations never act through a replacement account', () => {
  it.each(['unsend', 'remove', 'edit'] as const)('stops %s before its write when the ownership read crosses accounts', async action => {
    let resolve!: (value: unknown) => void;
    state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = setup();
    const pending = action === 'edit' ? result.current.edit.mutateAsync({ messageId: 'm1', newContent: 'Updated' }) : result.current[action].mutateAsync('m1');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account-changed' });
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    act(() => { switchTo('bob'); switchTo('alice'); });
    await act(async () => { resolve({ data: { sender_id: 'profile-alice', conversation_id: 'cid' } }); await rejected; });
    expect(state.write).not.toHaveBeenCalled(); expect(state.rpc).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });

  it('does not locate a temporary message in another account cache', async () => {
    const { result, client } = setup();
    client.setQueryData(['messages', 'foreign-cid', 'bob', reportAccountSnapshot().epoch], [{ id: 'temp-same-id' }]);
    await act(async () => { await expect(result.current.unsend.mutateAsync('temp-same-id')).rejects.toThrow('still sending'); });
    expect(state.read).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
  });

  it('keeps the previous text when an edit is not confirmed by the server', async () => {
    const { result, client } = setup();
    client.setQueryData(messagesQueryKey('cid'), [{ id: 'm1', content: 'Original' }]);
    state.rpc.mockResolvedValue({ error: { message: 'Editing unavailable' } });
    await act(async () => { await expect(result.current.edit.mutateAsync({ messageId: 'm1', newContent: 'Unconfirmed' })).rejects.toMatchObject({ message: 'Editing unavailable' }); });
    expect(client.getQueryData(messagesQueryKey('cid'))).toEqual([{ id: 'm1', content: 'Original' }]);
    expect(state.success).not.toHaveBeenCalled();
  });

  it('updates the current account cache only after a confirmed edit', async () => {
    const { result, client } = setup();
    client.setQueryData(messagesQueryKey('cid'), [{ id: 'm1', content: 'Original' }]);
    await act(async () => { await result.current.edit.mutateAsync({ messageId: 'm1', newContent: 'Confirmed' }); });
    expect(client.getQueryData(messagesQueryKey('cid'))).toMatchObject([{ content: 'Confirmed', is_edited: true }]);
    expect(state.success).toHaveBeenCalledWith('Message edited');
  });

  it('does not patch a new account or toast after an old delete acknowledgement', async () => {
    let resolve!: (value: unknown) => void;
    state.write.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, client } = setup();
    const pending = result.current.remove.mutateAsync('m1');
    const rejected = expect(pending).rejects.toMatchObject({ code: 'account-changed' });
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    act(() => switchTo('bob'));
    client.setQueryData(messagesQueryKey('cid'), [{ id: 'm1', content: 'Bob cache' }]);
    await act(async () => { resolve({ error: null }); await rejected; });
    expect(client.getQueryData(messagesQueryKey('cid'))).toEqual([{ id: 'm1', content: 'Bob cache' }]);
    expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
  });
});
