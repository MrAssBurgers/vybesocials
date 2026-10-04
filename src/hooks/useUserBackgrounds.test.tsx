import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAddBackground, useSetActiveBackground, useUserBackgrounds } from './useUserBackgrounds';
const mock = vi.hoisted(() => ({ uid: 'alice', profileId: 'alice-profile', liveUid: 'alice', load: vi.fn(), change: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: mock.profileId ? { id: mock.profileId } : null }) }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: { getUser: async () => ({ data: { user: { id: mock.liveUid } } }) } }));
vi.mock('@/lib/userBackgroundRepository', () => ({ loadUserBackgrounds: mock.load, changeUserBackground: mock.change }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error, warning: mock.warning } }));
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = mock.liveUid = 'alice'; mock.profileId = 'alice-profile';
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mock.load.mockResolvedValue([{ id: 'private-alice' }]);
  mock.change.mockImplementation(async (_account, _change, check) => { await check(); return { cleanupFailed: false }; });
});
afterEach(() => { cleanup(); client.clear(); });
describe('background account boundaries', () => {
  it('does not show the previous UID library even if the profile ID is temporarily stale', async () => {
    const hook = renderHook(useUserBackgrounds, { wrapper });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const pending = deferred<unknown[]>(); mock.load.mockReturnValue(pending.promise);
    mock.uid = mock.liveUid = 'bob'; hook.rerender();
    expect(hook.result.current.data).toBeUndefined();
    await act(async () => pending.resolve([]));
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
  });
  it('cancels old queries and never fetches while signed out', async () => {
    mock.load.mockReturnValue(new Promise(() => undefined));
    const hook = renderHook(useUserBackgrounds, { wrapper });
    await waitFor(() => expect(mock.load).toHaveBeenCalledTimes(1));
    const signal = mock.load.mock.calls[0][1] as AbortSignal;
    mock.uid = ''; mock.profileId = ''; hook.rerender();
    expect(signal.aborted).toBe(true); expect(mock.load).toHaveBeenCalledTimes(1);
    expect(hook.result.current.data).toBeUndefined();
  });
  it('uses the captured actor and rejects delayed old handlers after account switch', async () => {
    const hook = renderHook(useAddBackground, { wrapper }); const old = hook.result.current.mutateAsync;
    mock.uid = mock.liveUid = 'bob'; mock.profileId = 'bob-profile'; hook.rerender();
    await act(async () => { await expect(old({ imageUrl: 'https://example.test/old.png' })).rejects.toThrow('account changed'); });
    expect(mock.change.mock.calls[0][0]).toEqual({ authUid: 'alice', profileId: 'alice-profile' });
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
  });
  it('rejects an account change before the React auth update arrives', async () => {
    const hook = renderHook(useSetActiveBackground, { wrapper }); mock.liveUid = 'bob';
    await act(async () => { await expect(hook.result.current.mutateAsync('image')).rejects.toThrow('account changed'); });
    expect(mock.success).not.toHaveBeenCalled();
  });
  it('ignores a late old-account success after A→B→A and after unmount', async () => {
    const pending = deferred<{ cleanupFailed: boolean }>(); mock.change.mockReturnValue(pending.promise);
    const hook = renderHook(useSetActiveBackground, { wrapper });
    let result!: Promise<unknown>;
    act(() => { result = hook.result.current.mutateAsync('old'); });
    mock.uid = mock.liveUid = 'bob'; hook.rerender();
    mock.uid = mock.liveUid = 'alice'; hook.rerender(); hook.unmount();
    await act(async () => { pending.resolve({ cleanupFailed: false }); await result; });
    expect(mock.success).not.toHaveBeenCalled();
  });
  it('reports rejected persistence without a success claim', async () => {
    mock.change.mockRejectedValue(new Error('Write denied'));
    const hook = renderHook(useSetActiveBackground, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync('old')).rejects.toThrow('Write denied'); });
    expect(mock.error).toHaveBeenCalledWith('Write denied'); expect(mock.success).not.toHaveBeenCalled();
  });
});
