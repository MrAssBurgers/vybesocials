import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  uid: 'alice' as string | null, uiUid: 'alice',
  listener: null as null | ((user: { uid: string } | null) => void),
  result: Promise.resolve({ data: [] as unknown[], error: null as unknown }),
  failed: null as null | ((error: Error) => void),
  invoke: vi.fn(), stop: vi.fn(), load: vi.fn(),
}));
const auth = vi.hoisted(() => ({
  get currentUser() { return state.uid ? { uid: state.uid } : null; },
  onAuthStateChanged: (callback: typeof state.listener) => { state.listener = callback; return () => {}; },
}));
vi.mock('@/lib/firebase', () => ({ getFirebaseAuth: () => auth, db: { functions: { invoke: state.invoke } } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uiUid }, profile: { id: `profile-${state.uiUid}` } }) }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: vi.fn(), removeRealtimeChannel: vi.fn() }));
vi.mock('@/lib/communityMessages', () => ({
  watchCommunityChannel: vi.fn((_channel, _changed, failed) => { state.failed = failed; return state.stop; }),
  loadCommunityMessages: state.load,
}));
import { useChannelMessages, useLeaveServer } from './useServers';
import { communityAccountSnapshot } from '@/lib/communityService';
function fixture() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
const secret = { id: 'message', channel_id: 'private', content: 'Private message', media_url: 'https://example.invalid/private.jpg' };
const denied = () => { state.result = Promise.resolve({ data: [], error: Object.assign(new Error('Access removed'), { code: 'permission-denied' }) }); };
beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.uiUid = 'alice'; state.failed = null;
  state.result = Promise.resolve({ data: [secret], error: null });
  state.load.mockImplementation(async (_channel: string, guard: () => void) => {
    guard(); const result = await state.result; guard(); if (result.error) throw result.error; return result.data;
  });
});
afterEach(cleanup);
describe('private community history lifecycle', () => {
  it('removes already-loaded message and media data after a denied refetch', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => ({ ...useChannelMessages('private') }), { wrapper });
    await waitFor(() => expect(result.current.data?.[0].content).toBe('Private message'));
    denied(); await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
  });
  it('does not revive the previous Alice session after Alice to Bob to Alice', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => ({ ...useChannelMessages('private') }), { wrapper });
    await waitFor(() => expect(result.current.data?.[0].content).toBe('Private message'));
    denied();
    act(() => { state.uid = 'bob'; state.listener?.({ uid: 'bob' }); state.uid = 'alice'; state.listener?.({ uid: 'alice' }); });
    expect(result.current.data).toBeUndefined(); await waitFor(() => expect(result.current.isError).toBe(true));
  });
  it('starts when Firebase becomes ready without another React Auth render', async () => {
    state.uid = null;
    const { wrapper } = fixture(); const { result } = renderHook(() => ({ ...useChannelMessages('private') }), { wrapper });
    expect(state.load).not.toHaveBeenCalled();
    act(() => { state.uid = 'alice'; state.listener?.({ uid: 'alice' }); });
    await waitFor(() => expect(result.current.data?.[0].content).toBe('Private message'));
  });
  it('rejects an old server response after an account epoch change', async () => {
    let resolve!: (value: { data: unknown[]; error: unknown }) => void;
    state.result = new Promise(done => { resolve = done; });
    const { wrapper, client } = fixture(); const { result } = renderHook(() => ({ ...useChannelMessages('private') }), { wrapper });
    await waitFor(() => expect(state.load).toHaveBeenCalledTimes(1));
    denied(); act(() => { state.uid = 'bob'; state.listener?.({ uid: 'bob' }); });
    await act(async () => { resolve({ data: [secret], error: null }); });
    expect(result.current.data).toBeUndefined();
    expect(JSON.stringify(client.getQueryCache().getAll().map(query => query.state.data))).not.toContain('Private message');
  });
  it('hides existing media immediately when the native listener loses permission, before its refetch completes', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => ({ ...useChannelMessages('private') }), { wrapper });
    await waitFor(() => expect(result.current.data?.length).toBe(1));
    state.result = new Promise(() => {});
    act(() => { state.failed?.(new Error('Access removed')); });
    expect(result.current.isError).toBe(true); expect(result.current.data).toBeUndefined();
  });
  it('clears the old session and tears down its subscription after a successful leave', async () => {
    const { wrapper } = fixture(); state.invoke.mockResolvedValue({ data: { ok: true }, error: null });
    const { result } = renderHook(() => ({ messages: useChannelMessages('private'), leave: useLeaveServer() }), { wrapper });
    await waitFor(() => expect(result.current.messages.data?.length).toBe(1));
    const old = communityAccountSnapshot(); denied();
    await act(async () => { await result.current.leave.mutateAsync('server'); });
    expect(communityAccountSnapshot().epoch).not.toBe(old.epoch);
    expect(state.stop).toHaveBeenCalled(); expect(result.current.messages.data).toBeUndefined();
  });
});
