import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ invoke: vi.fn(), user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' }, auth: { currentUser: { uid: 'alice' } as { uid: string } | null, onAuthStateChanged: vi.fn() }, listeners: new Set<(user: { uid: string } | null) => void>() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { useNotificationPreferences, useUpdateNotificationPreference } from './useNotificationPreferences';
import { notificationBooleanKeys } from '@/lib/notificationPreferenceService';
const receipt = (likes = true, revision = 'a'.repeat(64)) => ({ data: { ok: true, ownerUid: 'alice', profileId: 'profile-alice', revision, values: { ...Object.fromEntries(notificationBooleanKeys.map(key => [key, true])), likes_enabled: likes, quiet_hours_start: null, quiet_hours_end: null, smart_ping_radius_miles: 5, smart_ping_max_per_day: 6 } }, error: null });
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
function authChange(uid: string | null) { state.auth.currentUser = uid ? { uid } : null; for (const listener of state.listeners) listener(state.auth.currentUser); }
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); state.listeners.clear(); state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; state.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: vi.fn(callback => { state.listeners.add(callback); return () => state.listeners.delete(callback); }) }; client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous } } }); });
afterEach(() => { cleanup(); client.clear(); });
it('shows no invented preferences before confirmation or after read failure', async () => {
  state.invoke.mockRejectedValue(new Error('Offline')); const { result } = renderHook(useNotificationPreferences, { wrapper }); expect(result.current.data).toBeUndefined();
  await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined(); expect(result.current.revision).toBeUndefined();
});
it('starts a disabled read when native Auth becomes ready without a provider rerender', async () => {
  state.auth.currentUser = null; state.invoke.mockResolvedValue(receipt()); const { result } = renderHook(useNotificationPreferences, { wrapper }); expect(state.invoke).not.toHaveBeenCalled();
  act(() => authChange('alice')); await waitFor(() => expect(result.current.data?.likes_enabled).toBe(true));
});
it('hides old saved values during refresh and on its failure', async () => {
  state.invoke.mockResolvedValue(receipt()); const { result } = renderHook(useNotificationPreferences, { wrapper }); await waitFor(() => expect(result.current.data?.likes_enabled).toBe(true));
  let reject!: (error: Error) => void; state.invoke.mockReturnValue(new Promise((_, failure) => { reject = failure; })); let pending!: Promise<unknown>; act(() => { pending = result.current.refetch(); }); await waitFor(() => expect(result.current.data).toBeUndefined());
  await act(async () => { reject(new Error('Unavailable')); await pending; }); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
});
it('never carries confirmed preferences across accounts or an A-B-A session with production placeholder defaults', async () => {
  state.invoke.mockResolvedValue(receipt());
  const { result, rerender } = renderHook(useNotificationPreferences, { wrapper });
  await waitFor(() => expect(result.current.data?.likes_enabled).toBe(true));
  state.invoke.mockReturnValue(new Promise(() => undefined));
  act(() => { state.user = { id: 'bob' }; state.profile = { id: 'profile-bob', user_id: 'bob' }; authChange('bob'); });
  rerender();
  expect(result.current.data).toBeUndefined(); expect(result.current.revision).toBeUndefined();
  act(() => { state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; authChange('alice'); });
  rerender();
  expect(result.current.data).toBeUndefined(); expect(result.current.revision).toBeUndefined();
});
it('keeps the confirmed state while a change is pending and serializes simultaneous toggles', async () => {
  state.invoke.mockResolvedValue(receipt()); const { result } = renderHook(() => ({ read: useNotificationPreferences(), update: useUpdateNotificationPreference() }), { wrapper }); await waitFor(() => expect(result.current.read.data).toBeDefined());
  let finish!: (value: ReturnType<typeof receipt>) => void; state.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; })); let pending!: Promise<unknown>;
  act(() => { pending = result.current.update.mutateAsync({ key: 'likes_enabled', value: false, revision: result.current.read.revision! }); }); await waitFor(() => expect(result.current.update.isPending).toBe(true)); expect(result.current.read.data?.likes_enabled).toBe(true);
  await act(async () => { await expect(result.current.update.mutateAsync({ key: 'calls_enabled', value: false, revision: result.current.read.revision! })).rejects.toThrow(/still saving/); });
  expect(result.current.update.isPending).toBe(true);
  await act(async () => { finish(receipt(false, 'b'.repeat(64))); await pending; }); await waitFor(() => expect(result.current.read.data?.likes_enabled).toBe(false)); expect(state.invoke).toHaveBeenCalledTimes(2);
});
it('retains the same request ID after an unconfirmed save and succeeds on deliberate retry', async () => {
  state.invoke.mockResolvedValueOnce({ data: null, error: { message: 'Lost reply' } }).mockResolvedValueOnce(receipt(false)); const { result } = renderHook(useUpdateNotificationPreference, { wrapper }); const input = { key: 'likes_enabled' as const, value: false, revision: 'a'.repeat(64) };
  await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Lost reply'); }); const first = state.invoke.mock.calls[0][1];
  await act(() => result.current.mutateAsync(input)); expect(state.invoke.mock.calls[1][1]).toEqual(first);
});
it('an old in-flight read cannot overwrite the confirmed revision after a save', async () => {
  state.invoke.mockResolvedValue(receipt()); const { result } = renderHook(() => ({ read: useNotificationPreferences(), update: useUpdateNotificationPreference() }), { wrapper }); await waitFor(() => expect(result.current.read.data).toBeDefined());
  let oldRead!: (value: ReturnType<typeof receipt>) => void;
  state.invoke.mockImplementation((_name, request) => request.action === 'read' ? new Promise(resolve => { oldRead = resolve; }) : Promise.resolve(receipt(false, 'b'.repeat(64))));
  let refreshing!: Promise<unknown>; act(() => { refreshing = result.current.read.refetch(); }); await waitFor(() => expect(result.current.read.isFetching).toBe(true));
  await act(() => result.current.update.mutateAsync({ key: 'likes_enabled', value: false, revision: 'a'.repeat(64) }));
  await act(async () => { oldRead(receipt()); await refreshing; }); await waitFor(() => expect(result.current.read.revision).toBe('b'.repeat(64))); expect(result.current.read.data?.likes_enabled).toBe(false);
});
it('reacts to A-B-A, retires old mutation locks and rejects stale callbacks', async () => {
  let finish!: (value: ReturnType<typeof receipt>) => void; state.invoke.mockReturnValueOnce(new Promise(resolve => { finish = resolve; })).mockResolvedValue(receipt(false));
  const { result } = renderHook(useUpdateNotificationPreference, { wrapper }); const old = result.current.mutateAsync, input = { key: 'likes_enabled' as const, value: false, revision: 'a'.repeat(64) };
  let pending!: Promise<unknown>; act(() => { pending = old(input).catch(error => error); }); await waitFor(() => expect(result.current.isPending).toBe(true));
  act(() => { authChange('bob'); authChange('alice'); }); await waitFor(() => expect(result.current.isPending).toBe(false));
  await act(() => result.current.mutateAsync(input)); await act(async () => { finish(receipt()); expect(await pending).toMatchObject({ code: 'account-changed' }); });
  expect(state.invoke).toHaveBeenCalledTimes(2);
});
it('does not update query state from a mutation after its originating view unmounts', async () => {
  let finish!: (value: ReturnType<typeof receipt>) => void; state.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; })); const { result, unmount } = renderHook(useUpdateNotificationPreference, { wrapper }); let pending!: Promise<unknown>;
  act(() => { pending = result.current.mutateAsync({ key: 'likes_enabled', value: false, revision: 'a'.repeat(64) }).catch(error => error); }); await waitFor(() => expect(state.invoke).toHaveBeenCalled()); unmount();
  await act(async () => { finish(receipt(false)); expect(await pending).toBeInstanceOf(Error); }); expect(client.getQueryCache().getAll()).toHaveLength(0);
});
