import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEquipSharedTheme, useMySharedThemes, useSavedThemes, useSharedThemeById, type SharedTheme } from './useSharedThemes';

const mocks = vi.hoisted(() => ({
  uid: 'alice-auth' as string | undefined, profileId: 'alice-profile' as string | undefined,
  liveUid: 'alice-auth' as string | undefined,
  saved: vi.fn(), own: vi.fn(), detail: vi.fn(), hasSaved: vi.fn(), upsert: vi.fn(), insert: vi.fn(),
  equip: vi.fn(), setTheme: vi.fn(), rpc: vi.fn(), success: vi.fn(), error: vi.fn(), warning: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mocks.uid ? { id: mocks.uid } : null, profile: mocks.profileId ? { id: mocks.profileId, user_id: mocks.uid } : null }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => mocks.profileId }));
vi.mock('@/lib/theme', () => ({ useTheme: () => ({ setTheme: mocks.setTheme }) }));
vi.mock('@/lib/firebase/authService', () => ({ firebaseAuth: { getUser: async () => ({ data: { user: mocks.liveUid ? { id: mocks.liveUid } : null } }) } }));
vi.mock('@/lib/sharedThemeRepository', () => ({ loadSavedThemes: mocks.saved, loadOwnSharedThemes: mocks.own, loadSharedTheme: mocks.detail, hasSavedTheme: mocks.hasSaved }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ upsert: mocks.upsert, insert: mocks.insert }), rpc: mocks.rpc } }));
vi.mock('@/hooks/useCustomTheme', () => ({ equipTheme: mocks.equip }));
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error, warning: mocks.warning } }));

const theme = {
  id: 'theme-one', creator_id: 'alice-profile', theme_name: 'Private violet', theme_tokens: { colorPrimary: '270 80% 50%', mode: 'dark' },
  is_public: false, likes_count: 0, downloads_count: 0, description: null, layout_settings: null, tags: null, category: null, created_at: '',
} as SharedTheme;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchAccount(uid: string | undefined, profileId = uid ? `${uid}-profile` : undefined) {
  mocks.uid = uid; mocks.liveUid = uid; mocks.profileId = profileId;
}
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  switchAccount('alice-auth', 'alice-profile');
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  mocks.saved.mockResolvedValue({ themes: [{ ...theme, saved_id: 'save-one' }], unavailableCount: 0 });
  mocks.own.mockResolvedValue([theme]); mocks.detail.mockResolvedValue(theme);
  mocks.hasSaved.mockResolvedValue(false);
  mocks.upsert.mockResolvedValue({ error: null }); mocks.insert.mockResolvedValue({ error: null });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

describe('private theme account isolation', () => {
  it('never shows the previous account collection or private detail while the next account loads', async () => {
    const hook = renderHook(() => ({ saved: useSavedThemes(), own: useMySharedThemes(), detail: useSharedThemeById('theme-one') }), { wrapper });
    await waitFor(() => expect(hook.result.current.detail.data?.theme_name).toBe('Private violet'));
    await waitFor(() => expect(hook.result.current.saved.data?.themes).toHaveLength(1));
    const nextSaved = deferred<{ themes: []; unavailableCount: number }>();
    const nextOwn = deferred<SharedTheme[]>();
    const nextDetail = deferred<SharedTheme | null>();
    mocks.saved.mockReturnValue(nextSaved.promise); mocks.own.mockReturnValue(nextOwn.promise); mocks.detail.mockReturnValue(nextDetail.promise);
    // Even a temporarily stale legacy profile ID cannot reuse another UID's cache.
    switchAccount('bob-auth', 'alice-profile');
    hook.rerender();
    expect(hook.result.current.saved.data).toBeUndefined();
    expect(hook.result.current.own.data).toBeUndefined();
    expect(hook.result.current.detail.data).toBeUndefined();
    await act(async () => { nextSaved.resolve({ themes: [], unavailableCount: 0 }); nextOwn.resolve([]); nextDetail.resolve(null); });
    await waitFor(() => expect(hook.result.current.detail.data).toBeNull());
    expect(client.getQueryData(['shared-theme', 'bob-auth', 'theme-one'])).toBeNull();
  });

  it('ignores a late old-account result after a new account has finished loading', async () => {
    const old = deferred<SharedTheme[]>();
    mocks.own.mockReturnValueOnce(old.promise).mockResolvedValue([]);
    const hook = renderHook(useMySharedThemes, { wrapper });
    await waitFor(() => expect(mocks.own).toHaveBeenCalledTimes(1));
    const signal = mocks.own.mock.calls[0][1].signal as AbortSignal;
    switchAccount('bob-auth', 'bob-profile'); hook.rerender();
    await waitFor(() => expect(hook.result.current.data).toEqual([]));
    expect(signal.aborted).toBe(true);
    await act(async () => { old.resolve([theme]); });
    expect(hook.result.current.data).toEqual([]);
    expect(client.getQueryData(['my-shared-themes', 'bob-auth', 'bob-profile'])).toEqual([]);
  });

  it('does not load private/detail data when signed out, even with a cached profile', async () => {
    switchAccount(undefined, 'alice-profile');
    const hook = renderHook(() => ({ saved: useSavedThemes(), own: useMySharedThemes(), detail: useSharedThemeById('theme-one') }), { wrapper });
    expect(hook.result.current.saved.data).toBeUndefined();
    expect(mocks.saved).not.toHaveBeenCalled(); expect(mocks.own).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
  });
});

describe('truthful shared-theme equip', () => {
  it('persists a rule-checked theme before applying it without a second implicit save', async () => {
    const save = deferred<{ error: null }>(); mocks.upsert.mockReturnValue(save.promise);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    let pending!: ReturnType<typeof hook.result.current.mutateAsync>;
    act(() => { pending = hook.result.current.mutateAsync(theme); });
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    expect(mocks.equip).not.toHaveBeenCalled(); expect(mocks.setTheme).not.toHaveBeenCalled();
    await act(async () => { save.resolve({ error: null }); await pending; });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'alice-auth', theme_name: theme.theme_name }), { onConflict: 'user_id' });
    expect(mocks.equip).toHaveBeenCalledWith(theme.theme_tokens, { userId: 'alice-auth', themeId: theme.id, silent: true, skipAutoSave: true });
    expect(client.getQueryData(['user-theme', 'alice-auth'])).toMatchObject({ theme_name: theme.theme_name });
    expect(localStorage.getItem('vybe-equipped-theme-id:alice-auth')).toBe(theme.id);
    expect(mocks.success).toHaveBeenCalledWith('Equipped ✨');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('does not paint, cache, or claim success when persistence returns an error', async () => {
    mocks.upsert.mockResolvedValue({ error: { message: 'Save denied' } });
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync(theme)).rejects.toMatchObject({ message: 'Save denied' }); });
    expect(mocks.equip).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled();
    expect(client.getQueryData(['user-theme', 'alice-auth'])).toBeUndefined();
    expect(mocks.error).toHaveBeenCalledWith('Could not equip theme'); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('rejects a theme whose read permission was revoked after it was cached', async () => {
    mocks.detail.mockResolvedValue(null);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    await act(async () => { await expect(hook.result.current.mutateAsync(theme)).rejects.toThrow('no longer available'); });
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.equip).not.toHaveBeenCalled();
  });

  it('drops a delayed successful save after account switching before further writes or painting', async () => {
    const save = deferred<{ error: null }>(); mocks.upsert.mockReturnValue(save.promise);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.mutateAsync(theme).catch(error => error); });
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    switchAccount('bob-auth', 'bob-profile'); hook.rerender();
    await act(async () => { save.resolve({ error: null }); await pending; });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.equip).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
    expect(client.getQueryData(['user-theme', 'bob-auth'])).toBeUndefined();
  });

  it('does not revive a stale operation after switching away and back to the same account', async () => {
    const saved = deferred<{ error: null }>(); mocks.upsert.mockReturnValue(saved.promise);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.mutateAsync(theme).catch(error => error); });
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1));
    switchAccount('bob-auth', 'bob-profile'); hook.rerender();
    switchAccount('alice-auth', 'alice-profile'); hook.rerender();
    await act(async () => { saved.resolve({ error: null }); await pending; });
    expect(mocks.equip).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('captures the account at click time before the mutation starts asynchronously', async () => {
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.mutateAsync(theme).catch(error => error); });
    switchAccount('bob-auth', 'bob-profile'); hook.rerender();
    await act(async () => { await pending; });
    expect(mocks.upsert).not.toHaveBeenCalled(); expect(mocks.equip).not.toHaveBeenCalled();
  });

  it('rejects a changed Firebase account even before React has rendered the change', async () => {
    const hook = renderHook(useEquipSharedTheme, { wrapper }); mocks.liveUid = 'bob-auth';
    await act(async () => { await expect(hook.result.current.mutateAsync(theme)).rejects.toThrow('account changed'); });
    expect(mocks.detail).not.toHaveBeenCalled(); expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not apply a pending theme after its view unmounts', async () => {
    const saved = deferred<{ error: null }>(); mocks.upsert.mockReturnValue(saved.promise);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.mutateAsync(theme).catch(error => error); });
    await waitFor(() => expect(mocks.upsert).toHaveBeenCalledTimes(1)); hook.unmount();
    await act(async () => { saved.resolve({ error: null }); await pending; });
    expect(mocks.equip).not.toHaveBeenCalled(); expect(mocks.success).not.toHaveBeenCalled();
  });

  it('avoids a duplicate automatic bookmark when the theme is already saved', async () => {
    mocks.hasSaved.mockResolvedValue(true);
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    await act(async () => { await hook.result.current.mutateAsync(theme); });
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.equip).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an equipped theme from a failed optional gallery save', async () => {
    mocks.insert.mockResolvedValue({ error: { message: 'Gallery unavailable' } });
    const hook = renderHook(useEquipSharedTheme, { wrapper });
    await act(async () => { await hook.result.current.mutateAsync(theme); });
    expect(mocks.equip).toHaveBeenCalledTimes(1);
    expect(mocks.warning).toHaveBeenCalledWith('Theme equipped, but it could not be added to Saved.');
    expect(mocks.success).not.toHaveBeenCalled(); expect(mocks.error).not.toHaveBeenCalled();
  });
});
