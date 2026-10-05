import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, fetch: vi.fn(), callbacks: [] as Array<{ update: () => void; error: (error: Error) => void; stop: ReturnType<typeof vi.fn> }> }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: true, profile: { id: uid }, session: { uid, epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('account changed'); } };
} }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => null }));
vi.mock('@/lib/vybemap/firestore', () => ({ fetchLiveFriends: state.fetch, subscribeLiveFriends: (_: string, update: () => void, error: (e: Error) => void) => {
  const stop = vi.fn(); state.callbacks.push({ update, error, stop }); return stop;
} }));
vi.mock('@/lib/vybemap/mapSocial', () => ({}));
vi.mock('@/lib/vybemap/mapbox/config', () => ({}));
import { useLiveFriends } from './useVybeMap';
const friends = ['bob'];
const row = { id: 'bob', user_id: 'bob', latitude: 30, longitude: -97, profile: { username: 'Private Bob' } };
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData, refetchOnMount: false, staleTime: Infinity, gcTime: 14 * 86400000 } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.callbacks.length = 0; state.fetch.mockReset(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
describe('live map account and permission cache boundaries', () => {
  it('hides previous-account data and a late Alice result after Alice→Bob→Alice', async () => {
    let finish!: (value: unknown) => void;
    state.fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    act(() => { state.uid = 'bob'; state.epoch++; hook.rerender(); });
    expect(hook.result.current.data).toEqual([]);
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
    act(() => { state.uid = 'alice'; state.epoch++; hook.rerender(); });
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(3));
    await act(async () => { finish([row]); });
    expect(hook.result.current.data).toEqual([]);
    expect(state.callbacks[0].stop).toHaveBeenCalledOnce();
  });
  it('hides retained positions on query/listener failure and restores only after a successful retry', async () => {
    state.fetch.mockResolvedValue([row]);
    const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    act(() => state.callbacks[0].error(new Error('permission denied')));
    expect(hook.result.current.data).toEqual([]); expect(hook.result.current.isError).toBe(true);
    state.fetch.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await hook.result.current.refetch(); });
    expect(hook.result.current.data).toEqual([]);
    state.fetch.mockResolvedValue([]);
    await act(async () => { await hook.result.current.refetch(); });
    expect(hook.result.current.isError).toBe(false); expect(hook.result.current.data).toEqual([]);
  });
  it('does not paint a same-account cached position before a new mount read', async () => {
    const wrap = wrapper(); state.fetch.mockResolvedValue([row]);
    const first = renderHook(() => useLiveFriends(friends), { wrapper: wrap });
    await waitFor(() => expect(first.result.current.data).toHaveLength(1)); first.unmount();
    state.fetch.mockImplementation(() => new Promise(() => {}));
    const second = renderHook(() => useLiveFriends(friends), { wrapper: wrap });
    expect(second.result.current.data).toEqual([]);
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(2));
  });
});
