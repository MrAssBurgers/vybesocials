import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((value: { uid: string }) => void), read: vi.fn(), write: vi.fn(), success: vi.fn(), error: vi.fn(), hide: vi.fn(), lock: vi.fn(), markRead: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentFromServer: state.read, updateDocument: state.write }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ update: (patch: unknown) => ({ eq: async (_key: string, id: string) => { await state.write('conversation_members', id, patch); return { error: null }; } }) }) } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}`, user_id: state.uid }, authReady: true }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `profile-${state.uid}` }));
vi.mock('@/hooks/useHiddenConversations', () => ({ useHideConversation: () => ({ mutateAsync: state.hide }) }));
vi.mock('@/hooks/useLockedChats', () => ({ useLockConversation: () => ({ mutateAsync: state.lock }), useUnlockConversation: () => ({ mutateAsync: state.lock }) }));
vi.mock('@/hooks/useDMConversations', () => ({ useMarkConversationRead: () => ({ mutateAsync: state.markRead }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, error: state.error } }));
import { useDmInboxActions } from './useDmInboxActions';
import { dmListQueryKey } from '@/lib/dmAccountScope';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { setActiveAuthUserId, setCachedCurrentProfile } from '@/lib/profileCache';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
const conversation = { id: 'chat', unread_count: 2, _hasUnread: true, last_message: { created_at: '2026-11-14T12:00:00.000Z' }, member_ids: ['profile-alice', 'profile-bob'], members: [{ conversation_id: 'chat', user_id: 'alice', is_pinned: false, is_muted: true }] } as LoadedDMConversation;
function switchTo(uid: string) {
  state.uid = uid; setActiveAuthUserId(uid);
  setCachedCurrentProfile({ id: `profile-${uid}`, user_id: uid, username: uid, display_name: uid, avatar_url: null });
  state.listener?.({ uid });
}
function setup() {
  const client = new QueryClient();
  const key = dmListQueryKey('profile-alice');
  client.setQueryData(key, [conversation]);
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDmInboxActions(conversation), { wrapper });
  const member = () => client.getQueryData<LoadedDMConversation[]>(key)![0].members![0];
  return { client, key, hook, member };
}
beforeEach(() => {
  switchTo('alice'); reportAccountSnapshot();
  state.hide.mockReset().mockResolvedValue(undefined); state.lock.mockReset().mockResolvedValue(undefined); state.markRead.mockReset().mockResolvedValue(undefined);
  state.read.mockReset().mockResolvedValue({ conversation_id: 'chat', user_id: 'alice' });
  state.write.mockReset().mockResolvedValue(undefined); state.success.mockReset(); state.error.mockReset();
});
afterEach(cleanup);
describe('existing inbox pin and mute actions', () => {
  it('reads legacy viewer flags and writes the matching existing membership', async () => {
    const { client, hook } = setup();
    expect(hook.result.current.isMuted).toBe(true);
    await act(async () => { await hook.result.current.togglePin.mutateAsync(true); });
    expect(state.read).toHaveBeenCalledWith('conversation_members', 'chat_alice');
    expect(state.write).toHaveBeenCalledWith('conversation_members', 'chat_alice', { is_pinned: true });
    expect(state.success).toHaveBeenCalledWith('Pinned'); client.clear();
  });
  it('patches the scoped inbox immediately and restores it on a rejected write', async () => {
    const { client, hook, member } = setup();
    let reject!: (error: Error) => void;
    state.write.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    act(() => hook.result.current.togglePin.mutate(true));
    await waitFor(() => expect(member().is_pinned).toBe(true));
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    act(() => reject(new Error('offline')));
    await waitFor(() => expect(hook.result.current.togglePin.isError).toBe(true));
    expect(member().is_pinned).toBe(false); expect(state.success).not.toHaveBeenCalled(); client.clear();
  });
  it('preserves an independently delivered member update when a write fails', async () => {
    const { client, key, hook, member } = setup();
    let reject!: (error: Error) => void;
    state.write.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    act(() => hook.result.current.toggleMute.mutate(false));
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    act(() => client.setQueryData(key, [{ ...conversation, members: [{ ...conversation.members![0], is_muted: false, last_read_at: 'fresh-realtime' }] }]));
    act(() => reject(new Error('rejected')));
    await waitFor(() => expect(hook.result.current.toggleMute.isError).toBe(true));
    expect(member()).toMatchObject({ is_muted: false, last_read_at: 'fresh-realtime' }); client.clear();
  });
  it('does not dispatch a membership write after the account leaves and returns', async () => {
    const { client, hook } = setup();
    let resolve!: (value: unknown) => void;
    state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    act(() => hook.result.current.togglePin.mutate(true));
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    act(() => { switchTo('bob'); switchTo('alice'); });
    await act(async () => resolve({ conversation_id: 'chat', user_id: 'alice' }));
    await waitFor(() => expect(hook.result.current.togglePin.isError).toBe(true));
    expect(state.write).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); client.clear();
  });
  it('restores a rejected pin without undoing a simultaneously accepted mute', async () => {
    const { client, hook, member } = setup();
    let rejectPin!: (error: Error) => void;
    state.write.mockImplementation((_table: string, _id: string, patch: { is_pinned?: boolean }) => patch.is_pinned !== undefined
      ? new Promise((_done, fail) => { rejectPin = fail; }) : Promise.resolve());
    act(() => hook.result.current.togglePin.mutate(true));
    await waitFor(() => expect(member().is_pinned).toBe(true));
    await act(async () => { await hook.result.current.toggleMute.mutateAsync(false); });
    act(() => rejectPin(new Error('pin rejected')));
    await waitFor(() => expect(hook.result.current.togglePin.isError).toBe(true));
    expect(member()).toMatchObject({ is_pinned: false, is_muted: false }); client.clear();
  });
  it('does not dispatch duplicate pending toggles of the same preference', async () => {
    const { client, hook } = setup();
    let resolve!: () => void;
    state.write.mockImplementation(() => new Promise<void>(done => { resolve = done; }));
    act(() => { hook.result.current.togglePin.mutate(true); hook.result.current.togglePin.mutate(false); });
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    expect(state.read).toHaveBeenCalledTimes(1);
    await act(async () => resolve()); client.clear();
  });
  it('rejects a retained control from an earlier account session', async () => {
    const { client, hook } = setup();
    const retained = hook.result.current.togglePin.mutateAsync;
    act(() => { switchTo('bob'); switchTo('alice'); });
    await expect(retained(true)).rejects.toThrow();
    expect(state.read).not.toHaveBeenCalled(); expect(state.write).not.toHaveBeenCalled(); client.clear();
  });
  it('restores its own failed cache change and reports it even after the row moves', async () => {
    const { client, hook, member } = setup();
    let reject!: (error: Error) => void;
    state.write.mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
    act(() => hook.result.current.togglePin.mutate(true));
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    hook.unmount();
    await act(async () => reject(new Error('rejected')));
    expect(member().is_pinned).toBe(false); expect(state.error).toHaveBeenCalledWith('Could not update pin'); client.clear();
  });
  it('finishes an authorized toggle when optimistic sorting unmounts its row', async () => {
    const { client, hook } = setup();
    let resolve!: (row: unknown) => void;
    state.read.mockImplementation(() => new Promise(done => { resolve = done; }));
    act(() => hook.result.current.togglePin.mutate(true));
    await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
    hook.unmount();
    await act(async () => resolve({ conversation_id: 'chat', user_id: 'alice' }));
    expect(state.write).toHaveBeenCalledWith('conversation_members', 'chat_alice', { is_pinned: true });
    expect(state.success).toHaveBeenCalledWith('Pinned'); client.clear();
  });
  it('leaves legacy keys and another session cache untouched', async () => {
    const { client, hook } = setup();
    const legacy = ['dm-conversations', 'profile-alice'];
    const other = ['dm-conversations', 'profile-alice', 'bob', 0];
    client.setQueryData(legacy, [conversation]); client.setQueryData(other, [conversation]);
    await act(async () => { await hook.result.current.togglePin.mutateAsync(true); });
    expect(client.getQueryData(legacy)).toEqual([conversation]); expect(client.getQueryData(other)).toEqual([conversation]); client.clear();
  });
  it.each([null, { conversation_id: 'other', user_id: 'alice' }, { conversation_id: 'chat', user_id: 'bob' }])('rejects a missing or mismatched server membership %j', async row => {
    const { client, hook, member } = setup(); state.read.mockResolvedValue(row);
    await act(async () => { await hook.result.current.togglePin.mutateAsync(true).catch(() => {}); });
    expect(state.write).not.toHaveBeenCalled(); expect(member().is_pinned).toBe(false); expect(state.success).not.toHaveBeenCalled(); client.clear();
  });
});

describe('existing inbox read, archive and lock actions', () => {
  it('marks the existing legacy membership unread and acknowledges only its write', async () => {
    const { client, hook } = setup();
    await act(async () => { await hook.result.current.markUnread.mutateAsync(); });
    expect(state.read).toHaveBeenCalledWith('conversation_members', 'chat_alice');
    expect(state.write).toHaveBeenCalledWith('conversation_members', 'chat_alice', { last_read_at: '2026-11-14T11:59:59.000Z' });
    expect(state.success).toHaveBeenCalledWith('Marked unread'); client.clear();
  });
  it('restores a rejected unread change without undoing a delivery to another row', async () => {
    const { client, key, hook } = setup();
    client.setQueryData(key, [{ ...conversation, unread_count: 0, _hasUnread: false }, { ...conversation, id: 'other', unread_count: 0 }]);
    let reject!: (error: Error) => void; state.write.mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
    act(() => hook.result.current.markUnread.mutate()); await waitFor(() => expect(state.write).toHaveBeenCalledOnce());
    act(() => client.setQueryData<LoadedDMConversation[]>(key, rows => rows!.map(row => row.id === 'other' ? { ...row, unread_count: 7 } : row)));
    act(() => reject(new Error('Rejected'))); await waitFor(() => expect(hook.result.current.markUnread.isError).toBe(true));
    const rows = client.getQueryData<LoadedDMConversation[]>(key)!;
    expect(rows[0].unread_count).toBe(0); expect(rows[1].unread_count).toBe(7); expect(state.success).not.toHaveBeenCalled(); client.clear();
  });
  it('rolls back a failed archive in the visible scoped inbox', async () => {
    const { client, key, hook } = setup(); let reject!: (error: Error) => void;
    state.hide.mockImplementation(() => new Promise((_done, fail) => { reject = fail; }));
    act(() => hook.result.current.archive.mutate()); await waitFor(() => expect(state.hide).toHaveBeenCalledOnce());
    expect(client.getQueryData(key)).toEqual([]); act(() => reject(new Error('Offline')));
    await waitFor(() => expect(hook.result.current.archive.isError).toBe(true));
    expect(client.getQueryData<LoadedDMConversation[]>(key)?.[0].id).toBe('chat'); expect(state.success).not.toHaveBeenCalled(); client.clear();
  });
  it('restores the locked set and inbox after a rejected lock', async () => {
    const { client, key, hook } = setup(), session = reportAccountSnapshot();
    const lockedKey = ['locked-chats', 'profile-alice', session.uid, session.epoch]; client.setQueryData(lockedKey, new Set());
    state.lock.mockRejectedValue(new Error('Rejected'));
    await act(async () => { await hook.result.current.toggleLock.mutateAsync(true).catch(() => {}); });
    expect(client.getQueryData<Set<string>>(lockedKey)?.has('chat')).toBe(false); expect(client.getQueryData<LoadedDMConversation[]>(key)?.[0].id).toBe('chat'); client.clear();
  });
  it('does not write unread state or report completion after account retirement during member lookup', async () => {
    const { client, hook } = setup(); let finish!: (value: unknown) => void;
    state.read.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    act(() => hook.result.current.markUnread.mutate()); await waitFor(() => expect(state.read).toHaveBeenCalledOnce());
    act(() => { switchTo('bob'); switchTo('alice'); }); hook.rerender();
    await act(async () => finish({ conversation_id: 'chat', user_id: 'alice' }));
    expect(state.write).not.toHaveBeenCalled(); expect(state.success).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled(); client.clear();
  });
});
