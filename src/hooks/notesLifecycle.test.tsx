import { installQueryCacheNormalizer } from '@/lib/persistedCollections';
vi.mock('@/lib/profileAvatarCache', () => ({ enrichProfileAvatar: (profile: unknown) => profile }));
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ uid: 'alice', profileOwner: 'alice', auth: null as any, listener: null as any, invoke: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.uid ? { id: mock.uid } : null, profile: { id: `${mock.uid}-profile`, user_id: mock.profileOwner } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => mock.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: mock.invoke }));
import { useMyNote, useFriendsNotes, useSetNote, useDeleteNote } from './useNotes';
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function switchTo(uid: string) { mock.uid = mock.profileOwner = uid; mock.auth.currentUser = uid ? { uid } : null; mock.listener?.(mock.auth.currentUser); }
const page = (uid = 'alice', now = Date.now()) => ({ ownerUid: uid, viewerProfileId: `${uid}-profile`, checkedAt: now,
  notes: [{ id: 'bob', user_id: 'bob', content: 'Private friend note', gif_url: null, created_at: new Date(now).toISOString(), expires_at: new Date(now + 86400000).toISOString(), profile: { id: 'bob-profile', username: 'bob', display_name: 'Bob', avatar_url: null } }], nextCursor: null });
beforeEach(() => {
  vi.clearAllMocks(); mock.uid = mock.profileOwner = 'alice'; mock.listener = null;
  mock.auth = { currentUser: { uid: 'alice' }, onAuthStateChanged: (callback: any) => { mock.listener = callback; return () => {}; } };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.invoke.mockImplementation((name, input) => ({ data: name === 'getFriendsNotes' ? page(input.expectedOwnerUid) : { ownerUid: input.expectedOwnerUid, viewerProfileId: input.expectedProfileId, checkedAt: Date.now(), note: null, revision: null }, error: null }));
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('does not read without a matching signed-in profile', async () => {
  mock.profileOwner = 'other';
  renderHook(() => ({ own: useMyNote(), friends: useFriendsNotes() }), { wrapper });
  await act(async () => { await Promise.resolve(); });
  expect(mock.invoke).not.toHaveBeenCalled();
});
it('drops old account data immediately and does not restore late reads after away-and-back', async () => {
  let finish!: (result: unknown) => void;
  mock.invoke.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const hook = renderHook(() => useFriendsNotes(), { wrapper });
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(1));
  act(() => { switchTo('other'); switchTo('alice'); });
  await act(async () => finish({ data: page(), error: null }));
  expect(hook.result.current.data).toEqual([]);
});
it('failed refresh removes old notes and exposes Retry state', async () => {
  const hook = renderHook(() => useFriendsNotes(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  mock.invoke.mockResolvedValue({ data: null, error: { message: 'Notes unavailable' } });
  await act(async () => { await hook.result.current.refetch(); });
  await waitFor(() => expect(hook.result.current.isError).toBe(true)); expect(hook.result.current.data).toEqual([]);
});
it('hides notes while the document is hidden and requires fresh admission on return', async () => {
  const hook = renderHook(() => useFriendsNotes(), { wrapper });
  await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
  let visible = false; vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visible ? 'visible' : 'hidden');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(hook.result.current.data).toEqual([]);
  mock.invoke.mockReturnValue(new Promise(() => {})); visible = true;
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(hook.result.current.data).toEqual([]);
});
it('expires displayed access while a refresh is still pending', async () => {
  vi.useFakeTimers(); vi.setSystemTime(Date.parse('2026-10-04T12:00:00Z'));
  const hook = renderHook(() => useFriendsNotes(), { wrapper });
  await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(hook.result.current.data).toHaveLength(1);
  mock.invoke.mockReturnValue(new Promise(() => {}));
  await act(async () => { await vi.advanceTimersByTimeAsync(31000); });
  expect(hook.result.current.data).toEqual([]); expect(hook.result.current.isExpired).toBe(true);
});
it('retains save retry identity and suppresses late account callbacks', async () => {
  const hook = renderHook(() => useSetNote(), { wrapper });
  const onError = vi.fn(), onSuccess = vi.fn();
  const input = { content: 'Hello', expectedRevision: null };
  mock.invoke.mockResolvedValue({ data: null, error: { message: 'Connection lost' } });
  act(() => hook.result.current.mutate(input, { onError }));
  await waitFor(() => expect(onError).toHaveBeenCalled());
  const first = mock.invoke.mock.calls[0][1];
  mock.invoke.mockImplementation((_name, request) => { switchTo('other'); return { data: { success: true, ownerUid: 'alice', viewerProfileId: 'alice-profile', action: 'save', requestId: request.requestId, revision: 'a'.repeat(48) }, error: null }; });
  act(() => hook.result.current.mutate(input, { onSuccess, onError }));
  await waitFor(() => expect(mock.invoke).toHaveBeenCalledTimes(2));
  await act(async () => { await Promise.resolve(); });
  expect(mock.invoke.mock.calls[1][1].requestId).toBe(first.requestId);
  expect(onSuccess).not.toHaveBeenCalled(); expect(onError).toHaveBeenCalledTimes(1);
});
it('deletion propagates rejection rather than notifying success', async () => {
  mock.invoke.mockResolvedValue({ data: null, error: { message: 'Your note changed' } });
  const hook = renderHook(() => useDeleteNote(), { wrapper }); const onError = vi.fn(), onSuccess = vi.fn();
  act(() => hook.result.current.mutate({ expectedRevision: 'a'.repeat(48) }, { onError, onSuccess }));
  await waitFor(() => expect(onError).toHaveBeenCalled()); expect(onSuccess).not.toHaveBeenCalled();
});

it('keeps admitted infinite pages intact under the real app cache normalizer', async () => {
  const stop = installQueryCacheNormalizer(client);
  try {
    const hook = renderHook(() => useFriendsNotes(), { wrapper });
    await waitFor(() => expect(hook.result.current.data).toHaveLength(1));
    const data = client.getQueryCache().getAll().find(query => query.queryKey[0] === 'friends-notes')?.state.data;
    expect(data).toEqual(expect.objectContaining({ pages: expect.any(Array), pageParams: expect.any(Array) }));
    await act(async () => { await hook.result.current.refetch(); });
    expect(hook.result.current.data[0].content).toBe('Private friend note');
  } finally { stop(); }
});
