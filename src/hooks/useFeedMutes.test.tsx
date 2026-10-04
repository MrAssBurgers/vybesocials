import { type PropsWithChildren, useSyncExternalStore } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice', sessionUid: 'alice', epoch: 1, listeners: new Set<() => void>(), list: vi.fn(), save: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.uid ? { id: state.uid } : null }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => {
  const epoch = useSyncExternalStore(listener => { state.listeners.add(listener); return () => { state.listeners.delete(listener); }; }, () => state.epoch);
  return { uid: state.sessionUid || undefined, epoch };
} }));
vi.mock('@/lib/feedMuteService', () => ({
  feedMuteAccountSnapshot: () => ({ uid: state.uid || undefined, epoch: state.epoch }),
  feedMuteAccountGuard: (expected: string) => { const epoch = state.epoch; return () => { if (!expected || state.sessionUid !== expected || state.epoch !== epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; },
  listFeedMutes: state.list, saveFeedMute: state.save, removeFeedMute: state.remove,
  mutedAuthorIds: (rows: { profileId: string; uid: string; needsRepair?: boolean }[]) => new Set(rows.filter(row => !row.needsRepair).flatMap(row => [row.profileId, row.uid])),
}));
import { useFeedMuteActions, useFeedMutes } from './useFeedMutes';

const bob = { profileId: 'bob-profile', uid: 'bob' };
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { state.uid = 'alice'; state.sessionUid = 'alice'; state.epoch = 1; state.list.mockReset().mockResolvedValue([]); state.save.mockReset().mockResolvedValue(bob); state.remove.mockReset().mockResolvedValue(undefined); });
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }

describe('feed mute mutation lifetimes', () => {
  it('starts a disabled mute read when Firebase finishes restoring the matching account without a parent rerender', async () => {
    state.sessionUid = ''; state.list.mockResolvedValue([bob]);
    const context = setup(); const hook = renderHook(useFeedMutes, context);
    expect(hook.result.current.ready).toBe(false); expect(state.list).not.toHaveBeenCalled();
    act(() => { state.sessionUid = 'alice'; state.epoch++; state.listeners.forEach(notify => notify()); });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    expect(hook.result.current.rows).toEqual([bob]); expect(state.list).toHaveBeenCalledTimes(1);
    hook.unmount(); context.client.clear();
  });
  it('updates only after acknowledgement and restores via account-bound undo after menu unmount', async () => {
    const context = setup(); const hook = renderHook(() => useFeedMuteActions('bob'), context);
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const save = deferred<typeof bob>(); state.save.mockReturnValue(save.promise);
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.mute('bob'); });
    expect(context.client.getQueryData(hook.result.current.key)).toEqual([]);
    state.list.mockResolvedValue([bob]);
    await act(async () => { save.resolve(bob); await pending; });
    expect(context.client.getQueryData(hook.result.current.key)).toEqual([bob]);
    const undo = hook.result.current.undo; hook.unmount(); state.list.mockResolvedValue([]);
    await act(async () => { await undo(bob.profileId); });
    expect(state.remove).toHaveBeenCalledExactlyOnceWith(bob.profileId, expect.any(Function)); context.client.clear();
  });
  it('does not alter cached mutes or show a partial list after failed saving', async () => {
    state.list.mockResolvedValue([bob]); state.save.mockRejectedValue(new Error('Denied'));
    const context = setup(); const hook = renderHook(() => useFeedMuteActions('carol'), context);
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    await act(async () => { await expect(hook.result.current.mute('carol')).rejects.toThrow('Denied'); });
    expect(context.client.getQueryData(hook.result.current.key)).toEqual([bob]); hook.unmount(); context.client.clear();
  });
  it('does not apply successful old-account or old-target acknowledgements to current UI/cache', async () => {
    const context = setup(); const hook = renderHook(({ target }) => useFeedMuteActions(target), { ...context, initialProps: { target: 'bob' } });
    await waitFor(() => expect(hook.result.current.ready).toBe(true));
    const originalKey = hook.result.current.key; const save = deferred<typeof bob>(); state.save.mockReturnValue(save.promise);
    let pending!: Promise<unknown>; act(() => { pending = hook.result.current.mute('bob'); });
    hook.rerender({ target: 'carol' });
    await act(async () => { save.resolve(bob); await expect(pending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(context.client.getQueryData(originalKey)).toEqual([]);
    const oldUndo = hook.result.current.undo; state.epoch++;
    await expect(oldUndo(bob.profileId)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.remove).not.toHaveBeenCalled(); hook.unmount(); context.client.clear();
  });
  it('uses fresh account query identity and exposes invalid rows for Settings repair', async () => {
    state.list.mockResolvedValue([{ profileId: 'broken', uid: '', needsRepair: true }]);
    const context = setup(); const hook = renderHook(useFeedMutes, context);
    await waitFor(() => expect(hook.result.current.needsRepair).toBe(true));
    expect(hook.result.current.ready).toBe(false); expect(hook.result.current.rows).toHaveLength(1); expect(hook.result.current.aliases.size).toBe(0);
    const oldKey = hook.result.current.key; state.uid = 'bob'; state.sessionUid = 'bob'; state.epoch++; state.list.mockResolvedValue([]); hook.rerender();
    expect(hook.result.current.key).not.toEqual(oldKey); expect(hook.result.current.rows).toBeUndefined();
    await waitFor(() => expect(hook.result.current.ready).toBe(true)); expect(hook.result.current.rows).toEqual([]);
    hook.unmount(); context.client.clear();
  });
});
