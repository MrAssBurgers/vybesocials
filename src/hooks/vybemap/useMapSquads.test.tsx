import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { squadFixture, squadTime, squadDeferred } from '@/test/mapSquadFixture';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, request: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const uid = state.uid, epoch = state.epoch;
  return { user: { id: uid }, profile: { id: `profile-${uid}`, user_id: uid }, session: { uid, epoch }, ready: !!uid, guard: () => { if (!uid || state.uid !== uid || state.epoch !== epoch) throw new Error('Account changed'); } };
} }));
vi.mock('@/lib/vybemap/mapSquadService', () => ({ manageMapSquad: (...args: unknown[]) => state.request(...args) }));
import { useSquadAction, useSquadDetail, useSquadList, useSquadMatches, useSquadRoster } from './useMapSquads';
let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const page = () => ({ ...squadTime(), items: [squadFixture()], nextCursor: null });
const detail = () => ({ ...squadTime(), squadId: 'squad-one', squad: squadFixture(), members: [{ profile_id: 'profile-alice', username: 'Alice', display_name: null, avatar_url: null, role: 'owner' }], nextCursor: null });
beforeEach(() => {
  vi.clearAllMocks(); state.uid = 'alice'; state.epoch++;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: old => old, refetchOnMount: false, gcTime: 14 * 86400_000 } } });
  state.request.mockImplementation(async (_actor, input, guard) => { guard(); return input.action === 'list' ? page() : input.action === 'read' ? detail() : { ...squadTime(), squadId: 'squad-one', matchedProfileIds: ['profile-alice'] }; });
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
describe('current squad query admission', () => {
  it('never inherits previous-account placeholders or late ABA responses from production defaults', async () => {
    const hook = renderHook(() => useSquadList(), { wrapper }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const held = squadDeferred<ReturnType<typeof page>>(); state.request.mockReturnValue(held.promise);
    state.uid = 'bob'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    state.uid = 'alice'; state.epoch++; hook.rerender(); expect(hook.result.current.data).toBeUndefined();
    hook.unmount(); await act(async () => held.resolve(page())); await waitFor(() => expect(client.getQueryCache().getAll().filter(query => query.state.data)).toHaveLength(0));
  });
  it('forces a checked read on reopening the same squad and hides a failed refresh', async () => {
    const hook = renderHook(() => useSquadDetail('squad-one'), { wrapper }); await waitFor(() => expect(hook.result.current.data?.squad).not.toBeNull()); await waitFor(() => expect(hook.result.current.data).toBeDefined());
    hook.unmount(); state.request.mockReturnValue(new Promise(() => {}));
    const next = renderHook(() => useSquadDetail('squad-one'), { wrapper }); expect(next.result.current.data).toBeUndefined(); await waitFor(() => expect(state.request).toHaveBeenCalledTimes(2));
    state.request.mockRejectedValue(new Error('denied')); await act(async () => { await next.result.current.refetch({ cancelRefetch: true }); });
    await waitFor(() => expect(next.result.current.isError).toBe(true)); expect(next.result.current.data).toBeUndefined();
  });
  it('expires detail and matched highlights while a refresh remains pending', async () => {
    vi.useFakeTimers(); const hook = renderHook(() => ({ detail: useSquadDetail('squad-one'), matches: useSquadMatches('squad-one', ['profile-alice']) }), { wrapper });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); }); expect(hook.result.current.matches.data?.matchedProfileIds).toEqual(['profile-alice']);
    state.request.mockReturnValue(new Promise(() => {})); await act(async () => { await vi.advanceTimersByTimeAsync(15_001); });
    expect(hook.result.current.detail.data).toBeUndefined(); expect(hook.result.current.matches.data).toBeUndefined();
  });
  it('hides known squads while hidden and requires new foreground admission', async () => {
    const hook = renderHook(() => useSquadList(), { wrapper }); await waitFor(() => expect(hook.result.current.data).toHaveLength(1)); state.request.mockReturnValue(new Promise(() => {}));
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }); expect(hook.result.current.data).toBeUndefined();
    act(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }); expect(hook.result.current.data).toBeUndefined();
  });
  it('retires older detail/highlights/roster/list rows when a new roster page denies access', async () => {
    state.request.mockImplementation(async (_actor, input) => input.action === 'list' ? page() : input.action === 'matchMembers' ? { ...squadTime(), squadId: 'squad-one', matchedProfileIds: ['profile-alice'] } : input.cursor ? { ...detail(), squad: null, members: [], nextCursor: null } : { ...detail(), nextCursor: 'c'.repeat(48) });
    const hook = renderHook(() => ({ list: useSquadList(), detail: useSquadDetail('squad-one'), roster: useSquadRoster('squad-one'), matches: useSquadMatches('squad-one', ['profile-alice']) }), { wrapper });
    await waitFor(() => { expect(hook.result.current.roster.error).toBeNull(); expect(hook.result.current.roster.data).toHaveLength(1); }); await waitFor(() => expect(hook.result.current.matches.data).toBeDefined());
    await act(async () => { await hook.result.current.roster.fetchNextPage(); });
    await waitFor(() => expect(hook.result.current.detail.data?.squad).toBeNull()); expect(hook.result.current.roster.data).toBeUndefined(); expect(hook.result.current.roster.isError).toBe(true); expect(hook.result.current.list.data).toEqual([]); expect(hook.result.current.matches.data?.matchedProfileIds).toEqual([]);
  });
  it('cannot restore denied first-page names from a concurrent older Load more append', async () => {
    const held = squadDeferred<ReturnType<typeof page>>(); let revoked = false;
    state.request.mockImplementation(async (_actor, input) => input.action === 'list' ? input.cursor ? held.promise : { ...page(), nextCursor: 'c'.repeat(48) } : revoked ? { ...detail(), squad: null, members: [] } : detail());
    const hook = renderHook(() => ({ list: useSquadList(), detail: useSquadDetail('squad-one') }), { wrapper }); await waitFor(() => expect(hook.result.current.list.data).toHaveLength(1));
    let more!: Promise<unknown>; act(() => { more = hook.result.current.list.fetchNextPage(); }); revoked = true;
    await act(async () => { await hook.result.current.detail.refetch(); });
    await act(async () => { held.resolve({ ...page(), items: [] }); await more; }); await waitFor(() => expect(hook.result.current.list.data).toEqual([]));
  });
  it('preserves empty continuation pages and bounds polling to three pages per explicit group', async () => {
    state.request.mockImplementation(async (_actor, input) => { const n = input.cursor ? Number(input.cursor[0]) : 0; return { ...page(), items: n === 0 ? [] : [squadFixture({ id: `squad-${n}` })], nextCursor: n < 4 ? String(n + 1).repeat(48) : null }; });
    const hook = renderHook(() => useSquadList(), { wrapper }); await waitFor(() => expect(hook.result.current.hasNextPage).toBe(true)); expect(hook.result.current.data).toEqual([]);
    await act(async () => { await hook.result.current.fetchNextPage(); }); await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.nextGroup).toBe(true));
    await act(async () => { await hook.result.current.fetchNextPage(); }); await waitFor(() => expect(hook.result.current.data?.map(row => row.id)).toEqual(['squad-3'])); expect(hook.result.current.windowed).toBe(true);
  });
  it('does not acknowledge an otherwise committed mutation when its visible view retires', async () => {
    const held = squadDeferred<object>(), acknowledge = vi.fn(); state.request.mockReturnValue(held.promise); let visible = true;
    const hook = renderHook(() => useSquadAction('create'), { wrapper });
    let saving!: Promise<unknown>; act(() => { saving = hook.result.current.mutateAsync({ action: 'create', name: 'Crew', emoji: '🗺️' }, () => { if (!visible) throw new Error('view retired'); }); });
    const assertion = expect(saving).rejects.toThrow('view retired'); await waitFor(() => expect(state.request).toHaveBeenCalledOnce()); visible = false;
    await act(async () => { held.resolve({ status: 'active', squad: squadFixture(), acknowledge }); await assertion; }); expect(acknowledge).not.toHaveBeenCalled();
  });
});
