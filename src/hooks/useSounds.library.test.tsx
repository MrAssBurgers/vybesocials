import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ read: vi.fn(), session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.profile.id }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/commentService', () => ({ readCommentCounts: vi.fn() }));
vi.mock('@/hooks/useMusicPlayback', () => ({ useMusicPlayback: vi.fn() }));
vi.mock('@/lib/soundUploadService', () => ({ readSoundLibrary: state.read, captureSoundActor: (uid: string, profileId: string, view: () => void) => { const epoch = state.session.epoch; const guard = () => { view(); if (uid !== state.session.uid || epoch !== state.session.epoch) throw new Error('Account changed'); }; guard(); return { uid, profileId, guard }; } }));
import { useMySounds, useSound } from './useSounds';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, gcTime: 14 * 86400000, refetchOnMount: false, staleTime: 1800000, networkMode: 'offlineFirst' } } }); }); afterEach(() => { cleanup(); client.clear(); });
it('loads confirmed uploads and masks cached rows on a current read failure', async () => {
  state.read.mockResolvedValue({ sounds: [{ sound_id: 'a'.repeat(64), title: 'My real upload' }], nextCursor: null }); const { result } = renderHook(useMySounds, { wrapper }); await waitFor(() => expect(result.current.data?.[0].title).toBe('My real upload'));
  state.read.mockRejectedValue(new Error('Service unavailable')); await act(() => result.current.refetch()); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.data).toBeUndefined();
});
it('scopes sound details to account epochs without reusing Alice content after A-B-A', async () => {
  state.read.mockResolvedValueOnce({ sounds: [{ sound_id: 'a'.repeat(64), title: 'Previous result' }], nextCursor: null }); const { result, rerender } = renderHook(() => useSound('a'.repeat(64)), { wrapper }); await waitFor(() => expect(result.current.data?.title).toBe('Previous result'));
  state.session = { uid: 'alice', epoch: 3 }; state.read.mockReturnValue(new Promise(() => {})); rerender(); expect(result.current.data).toBeUndefined(); expect(state.read.mock.calls[1][0]).toMatchObject({ uid: 'alice', profileId: 'profile-alice' });
});
it('rejects an old observer retry before a new account render can occur', async () => {
  state.read.mockResolvedValue({ sounds: [], nextCursor: null }); const { result } = renderHook(useMySounds, { wrapper }); await waitFor(() => expect(result.current.isSuccess).toBe(true)); const previousCalls = state.read.mock.calls.length;
  state.session = { uid: 'alice', epoch: 3 }; await act(() => result.current.refetch()); expect(state.read).toHaveBeenCalledTimes(previousCalls);
});
it('does not inherit the production previous-query placeholder when the library account changes', async () => {
  state.read.mockResolvedValue({ sounds: [{ sound_id: 'a'.repeat(64), title: 'Alice recording' }], nextCursor: null });
  const { result, rerender } = renderHook(useMySounds, { wrapper }); await waitFor(() => expect(result.current.data?.[0].title).toBe('Alice recording'));
  state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' }; state.profile = { id: 'profile-bob', user_id: 'bob' }; state.read.mockReturnValue(new Promise(() => {})); rerender();
  expect(result.current.data).toBeUndefined(); expect(result.current.isPlaceholderData).toBe(false);
});
it('does not show the previous sound while loading a different selection under production defaults', async () => {
  const first = 'a'.repeat(64), second = 'b'.repeat(64); state.read.mockResolvedValue({ sounds: [{ sound_id: first, title: 'Previous selection' }], nextCursor: null });
  const { result, rerender } = renderHook(({ id }) => useSound(id), { wrapper, initialProps: { id: first } }); await waitFor(() => expect(result.current.data?.sound_id).toBe(first));
  state.read.mockReturnValue(new Promise(() => {})); rerender({ id: second }); expect(result.current.data).toBeUndefined(); expect(result.current.isPlaceholderData).toBe(false);
});
it('requires a new read when reopening a same-account library/detail even while another observer retains the old cache', async () => {
  const id = 'a'.repeat(64); state.read.mockResolvedValue({ sounds: [{ sound_id: id, title: 'Previously admitted' }], nextCursor: null });
  const useBoth = () => ({ library: useMySounds(), detail: useSound(id) });
  const keeper = renderHook(useBoth, { wrapper }); await waitFor(() => expect(keeper.result.current.detail.data?.title).toBe('Previously admitted')); await waitFor(() => expect(keeper.result.current.library.data).toHaveLength(1));
  const finishes: Array<(value: unknown) => void> = []; state.read.mockImplementation(() => new Promise(resolve => { finishes.push(resolve); }));
  const reopened = renderHook(useBoth, { wrapper }); expect(reopened.result.current.library.data).toBeUndefined(); expect(reopened.result.current.detail.data).toBeUndefined(); expect(reopened.result.current.library.isLoading).toBe(true);
  await waitFor(() => expect(finishes).toHaveLength(2)); await act(async () => { for (const finish of finishes) finish({ sounds: [], nextCursor: null }); });
  await waitFor(() => expect(reopened.result.current.library.data).toEqual([])); expect(reopened.result.current.detail.data).toBeNull();
  for (const query of client.getQueryCache().getAll()) { expect(query.options.gcTime).toBe(0); expect(query.options.refetchOnMount).toBe('always'); }
});
