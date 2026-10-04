import type { ReactNode } from 'react';
import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'auth-a', listener: null as null | ((user: { uid: string }) => void), invoke: vi.fn(), from: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged: (callback: (user: { uid: string }) => void) => { state.listener = callback; return () => {}; } }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from, functions: { invoke: state.invoke } }, getFirebaseAuth: () => auth }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}` } }) }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: vi.fn(), removeRealtimeChannel: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { useCreateServer, useJoinServer, useMyServers, useChannels, useSendChannelMessage } from './useServers';
import { useCreateCommunity, useJoinCommunity, useMyCommunities, useRooms } from './useCommunities';
import { toast } from 'sonner';
import { useCommunityMutation } from './useCommunityMutation';
import { useUpdateChannelPermission, useMyChannelPermissions } from './useChannelPermissions';
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};
beforeEach(() => { vi.clearAllMocks(); state.uid = 'auth-a'; state.invoke.mockReset(); state.from.mockReset().mockImplementation(() => { throw new Error('Unexpected browser database write/read'); }); });
afterEach(cleanup);
describe('both community interfaces share server authority', () => {
  it.each([useCreateServer, useCreateCommunity])('reuses a creation request after a lost response', async hook => {
    const { result } = renderHook(hook, { wrapper: wrapper() });
    state.invoke.mockResolvedValueOnce({ data: null, error: { code: 'unavailable', message: 'Response lost' } });
    await act(async () => { await expect(result.current.mutateAsync({ name: 'Private', isPublic: false })).rejects.toThrow('Response lost'); });
    const first = state.invoke.mock.calls[0][1].body;
    state.invoke.mockResolvedValueOnce({ data: { server: { id: 'created', name: 'Private' } }, error: null });
    await act(async () => { await result.current.mutateAsync({ name: 'Private', isPublic: false }); });
    expect(state.invoke.mock.calls[1][1].body.requestId).toBe(first.requestId);
    expect(first.requestId).toMatch(/^[\w-]{16,80}$/);
    expect(state.from).not.toHaveBeenCalled();
  });
  it.each([useJoinServer, useJoinCommunity])('uses separate public and private join bodies', async hook => {
    state.invoke.mockResolvedValue({ data: { server: { id: 'joined', name: 'Joined' } }, error: null });
    const { result } = renderHook(hook, { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync({ serverId: 'public' }); });
    expect(state.invoke.mock.calls[0]).toEqual(['community-join', { body: { serverId: 'public' } }]);
    const inviteCode = `vyc_${'A'.repeat(32)}`;
    await act(async () => { await result.current.mutateAsync(inviteCode); });
    expect(state.invoke.mock.calls[1]).toEqual(['community-join', { body: { inviteCode } }]);
    expect(state.from).not.toHaveBeenCalled();
  });
  it.each([useMyServers, useMyCommunities])('gets roles from trusted admissions rather than legacy browser-writable rows', async hook => {
    state.invoke.mockResolvedValue({ data: { servers: [{ id: 'private', myRole: 'member' }] }, error: null });
    const { result } = renderHook(hook, { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.invoke).toHaveBeenCalledWith('community-manage', { body: { action: 'listMine' } });
    expect(result.current.data?.[0].myRole).toBe('member');
    expect(state.from).not.toHaveBeenCalled();
  });
  it.each([useChannels, useRooms])('loads only server-filtered visible rooms', async hook => {
    state.invoke.mockResolvedValue({ data: { channels: [{ id: 'visible', server_id: 'private' }] }, error: null });
    const { result } = renderHook(() => hook('private'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.invoke).toHaveBeenCalledWith('community-manage', { body: { action: 'listChannels', serverId: 'private' } });
    expect(state.from).not.toHaveBeenCalled();
  });
  it('never converts a failed permissions lookup into send/view permission', async () => {
    state.invoke.mockResolvedValue({ data: null, error: { code: 'permission-denied', message: 'Join first' } });
    const { result } = renderHook(() => useMyChannelPermissions('room', 'private'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it.each([useCreateServer, useCreateCommunity])('rejects delayed creation after switching accounts', async hook => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(hook, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ name: 'Private' }); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    state.uid = 'auth-b'; rerender();
    await act(async () => { resolve({ data: { server: { id: 'private-a' } }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(toast.success).not.toHaveBeenCalled();
  });
  it.each([useJoinServer, useJoinCommunity])('rejects delayed join after switching accounts', async hook => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(hook, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ serverId: 'public' }); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    state.uid = 'auth-b'; rerender();
    await act(async () => { resolve({ data: { server: { id: 'private-a' } }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(toast.success).not.toHaveBeenCalled();
  });
  it('rejects delayed sends after switching accounts', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(useSendChannelMessage, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    const success = vi.fn();
    act(() => { pending = result.current.mutateAsync({ channelId: 'private-a', content: 'Draft' }, { onSuccess: success }); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    state.uid = 'auth-b'; rerender();
    await act(async () => { resolve({ data: { message: { id: 'message-a' } }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(success).not.toHaveBeenCalled();
  });
  it('checks account again before success callbacks', async () => {
    const success = vi.fn();
    const { result } = renderHook(() => useCommunityMutation({ mutationFn: async () => { state.uid = 'auth-b'; return {}; }, onSuccess: success }), { wrapper: wrapper() });
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(success).not.toHaveBeenCalled();
  });
  it('does not apply an old permission edit using a newly signed-in manager', async () => {
    let resolve!: (value: unknown) => void;
    const single = vi.fn(() => new Promise(done => { resolve = done; }));
    state.from.mockReturnValue({ select: () => ({ eq: () => ({ single }) }) });
    const { result, rerender } = renderHook(useUpdateChannelPermission, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ channelId: 'private', role: 'member', field: 'can_send', value: false }); });
    await waitFor(() => expect(single).toHaveBeenCalledTimes(1));
    state.uid = 'auth-b'; state.listener?.({ uid: state.uid }); rerender();
    await act(async () => { resolve({ data: { server_id: 'private-server' }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(state.invoke).not.toHaveBeenCalled();
  });
  it('rejects an old response after A to B to A even without an intervening render', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(useJoinServer, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ serverId: 'private' }); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    state.uid = 'auth-b'; state.listener?.({ uid: state.uid });
    state.uid = 'auth-a'; state.listener?.({ uid: state.uid });
    await act(async () => { resolve({ data: { server: { id: 'private' } }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(toast.success).not.toHaveBeenCalled();
  });
  it('rejects a completed mutation after its view unmounts', async () => {
    let resolve!: (value: unknown) => void;
    state.invoke.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, unmount } = renderHook(useCreateServer, { wrapper: wrapper() });
    let pending!: Promise<unknown>;
    act(() => { pending = result.current.mutateAsync({ name: 'Private' }); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => { resolve({ data: { server: { id: 'private' } }, error: null }); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(toast.success).not.toHaveBeenCalled();
  });
  it('retries unchanged messages with one receipt then starts fresh after success or draft changes', async () => {
    const { result } = renderHook(useSendChannelMessage, { wrapper: wrapper() });
    const draft = { channelId: 'room', content: 'Hello' };
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Response lost' } });
    await act(async () => { await expect(result.current.mutateAsync(draft)).rejects.toThrow('Response lost'); });
    const first = state.invoke.mock.calls[0][1].body.clientMessageId;
    state.invoke.mockResolvedValue({ data: { message: { id: 'sent' } }, error: null });
    await act(async () => { await result.current.mutateAsync(draft); });
    expect(state.invoke.mock.calls[1][1].body.clientMessageId).toBe(first);
    await act(async () => { await result.current.mutateAsync(draft); });
    expect(state.invoke.mock.calls[2][1].body.clientMessageId).not.toBe(first);
    state.invoke.mockResolvedValueOnce({ data: null, error: { name: 'unavailable', message: 'Response lost' } });
    await act(async () => { await expect(result.current.mutateAsync(draft)).rejects.toThrow(); });
    const failed = state.invoke.mock.calls[3][1].body.clientMessageId;
    await act(async () => { await result.current.mutateAsync({ ...draft, content: 'Edited' }); });
    expect(state.invoke.mock.calls[4][1].body.clientMessageId).not.toBe(failed);
  });
  it('does not reuse private room data after changing accounts', async () => {
    state.invoke.mockResolvedValueOnce({ data: { channels: [{ id: 'first-account-private' }] }, error: null });
    const { result, rerender } = renderHook(() => useChannels('private'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    state.uid = 'auth-b'; state.invoke.mockResolvedValue({ data: null, error: { code: 'permission-denied', message: 'Join first' } });
    rerender();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
