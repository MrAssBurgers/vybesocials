import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, invoke: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: !!uid, user: { id: uid }, profile: { id: uid, user_id: uid }, session: { uid, epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('account changed'); } };
} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: null }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => null }));
vi.mock('@/lib/vybemap/firestore', () => ({}));
vi.mock('@/lib/vybemap/mapSocial', () => ({}));
vi.mock('@/lib/vybemap/mapbox/config', () => ({}));
import { useLiveFriends, useMapHeatmap } from './useVybeMap';
import { locationRead } from '@/test/locationSharingFixtures';
const friends = ['bob'];
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData, refetchOnMount: false, staleTime: Infinity, gcTime: 14 * 86400000 } } });
  clients.push(client);
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const reply = (data = locationRead(), owner = 'alice') => ({ data: { ...data, ok: true, ownerUid: owner, profileId: owner, action: 'read', requestId: null }, error: null });
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.invoke.mockReset(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.useRealTimers(); vi.restoreAllMocks(); });
describe('live map checked admission and cache boundaries', () => {
  it('hides late Alice results after Alice→Bob→Alice', async () => {
    let finish!: (value: unknown) => void;
    state.invoke.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(reply(locationRead({ shares: [], locations: [] }), 'bob')).mockResolvedValueOnce(reply(locationRead({ shares: [], locations: [] })));
    const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
    act(() => { state.uid = 'bob'; state.epoch++; hook.rerender(); }); expect(hook.result.current.data).toEqual([]);
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
    act(() => { state.uid = 'alice'; state.epoch++; hook.rerender(); });
    await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(3));
    await act(async () => { finish(reply()); }); expect(hook.result.current.data).toEqual([]);
  });
  it('hides positions on admission failure and retries honestly', async () => {
    state.invoke.mockResolvedValue(reply());
    const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    state.invoke.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toEqual([]);
    state.invoke.mockResolvedValue(reply(locationRead({ shares: [], locations: [] })));
    await act(async () => { await hook.result.current.refetch(); });
    await waitFor(() => expect(hook.result.current.isError).toBe(false)); expect(hook.result.current.data).toEqual([]);
  });
  it('does not paint cached coordinates before a fresh same-account mount read', async () => {
    const wrap = wrapper(); state.invoke.mockResolvedValue(reply());
    const first = renderHook(() => useLiveFriends(friends), { wrapper: wrap });
    await waitFor(() => expect(first.result.current.data).toHaveLength(1)); first.unmount();
    state.invoke.mockImplementation(() => new Promise(() => {}));
    const second = renderHook(() => useLiveFriends(friends), { wrapper: wrap });
    expect(second.result.current.data).toEqual([]); await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
  });
  it('hides grants after the visible lease, even if the refresh never returns', async () => {
    state.invoke.mockResolvedValue(reply()); const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    state.invoke.mockImplementation(() => new Promise(() => {}));
    const now = Date.now(); vi.useFakeTimers(); vi.setSystemTime(now + 16_000);
    act(() => hook.rerender()); expect(hook.result.current.data).toEqual([]);
  });
  it('subtracts the entire round trip instead of extending an expired response lease', async () => {
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    let finish!: (value: unknown) => void;
    const receipt = reply();
    state.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(finish).toBeDefined()); clock.mockReturnValue(20_000);
    await act(async () => finish(receipt));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true)); expect(hook.result.current.data).toEqual([]);
  });
  it('never restores hidden-page grants before new foreground admission', async () => {
    state.invoke.mockResolvedValue(reply()); const hook = renderHook(() => useLiveFriends(friends), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toEqual([]); state.invoke.mockImplementation(() => new Promise(() => {}));
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    expect(hook.result.current.data).toEqual([]); await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(2));
  });
  it('derives heat only from admitted coarse locations and removes it on failure', async () => {
    state.invoke.mockResolvedValue(reply()); const hook = renderHook(() => useMapHeatmap(true), { wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    expect(hook.result.current.data[0].intensity).toBe(1);
    state.invoke.mockResolvedValue({ data: null, error: { message: 'unavailable' } });
    await act(async () => { await hook.result.current.refetch(); }); await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toEqual([]);
  });
});
