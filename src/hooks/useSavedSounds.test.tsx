import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ list: vi.fn(), status: vi.fn(), update: vi.fn(), session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => state.profile.id }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/commentService', () => ({ readCommentCounts: vi.fn() }));
vi.mock('@/hooks/useMusicPlayback', () => ({ useMusicPlayback: vi.fn() }));
vi.mock('@/lib/savedSoundService', () => ({ listSavedSounds: state.list, getSoundSaved: state.status, updateSavedSound: state.update }));
vi.mock('@/lib/soundUploadService', () => ({ readSoundLibrary: vi.fn(), captureSoundActor: (uid: string, profileId: string, view: () => void) => { const epoch = state.session.epoch; const guard = () => { view(); if (uid !== state.session.uid || epoch !== state.session.epoch) throw new Error('Account changed'); }; guard(); return { uid, profileId, guard }; } }));
import { useIsSoundSaved, useSavedSounds, useSaveSound, savedSoundsRefreshInterval } from './useSounds';
let client: QueryClient; const id = 'a'.repeat(64);
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: previous => previous, gcTime: 14 * 86400000, refetchOnMount: false, staleTime: 1800000, networkMode: 'offlineFirst' } } }); }); afterEach(() => { cleanup(); client.clear(); });
it('keeps unavailable rows and paginates admitted sounds without discarding references', async () => {
  state.list.mockResolvedValueOnce({ entries: [{ referenceId: id, soundId: id, legacy: false, sound: null }], nextCursor: 'a'.repeat(32) }).mockResolvedValueOnce({ entries: [{ referenceId: 'b'.repeat(64), soundId: 'b'.repeat(64), legacy: false, sound: { sound_id: 'b'.repeat(64), title: 'Current recording' } }], nextCursor: null });
  const { result } = renderHook(useSavedSounds, { wrapper }); await waitFor(() => expect(result.current.entries).toHaveLength(1)); expect(result.current.data).toEqual([]); await act(() => result.current.fetchNextPage()); await waitFor(() => expect(result.current.entries).toHaveLength(2)); expect(result.current.data?.[0].title).toBe('Current recording');
});
it('masks cached saved data when a current admission refresh fails', async () => {
  state.list.mockResolvedValue({ entries: [{ referenceId: id, soundId: id, legacy: false, sound: { sound_id: id, title: 'Admitted' } }], nextCursor: null }); const { result } = renderHook(useSavedSounds, { wrapper }); await waitFor(() => expect(result.current.data).toHaveLength(1)); state.list.mockRejectedValue(new Error('Denied')); await act(() => result.current.refetch()); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.entries).toBeUndefined(); expect(result.current.data).toBeUndefined();
});
it('hides old saved status after A-B-A and refuses a captured old mutation callback', async () => {
  state.status.mockResolvedValue(true); const { result, rerender } = renderHook(() => ({ status: useIsSoundSaved(id), changes: useSaveSound() }), { wrapper }); await waitFor(() => expect(result.current.status.data).toBe(true)); const oldSave = result.current.changes.saveSound;
  state.session = { uid: 'alice', epoch: 3 }; state.status.mockReturnValue(new Promise(() => {})); rerender(); expect(result.current.status.data).toBeUndefined(); await act(() => oldSave(id)); expect(state.update).not.toHaveBeenCalled();
});
it('does not paint a late mutation after account retirement or overwrite newer controls', async () => {
  let done!: (value: boolean) => void; state.update.mockReturnValue(new Promise(resolve => { done = resolve; })); const { result, rerender } = renderHook(useSaveSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.saveSound(id); });
  state.session = { uid: 'alice', epoch: 3 }; rerender(); await act(async () => { done(true); expect(await pending).toBeNull(); }); expect(result.current.pending).toBe(false); expect(client.getQueryData(['sounds', 'saved-status', id, 'alice', 'profile-alice', 3])).toBeUndefined();
});
it('preserves a failed save as an inline retry error and does not fake a changed preference', async () => {
  state.update.mockRejectedValue(new Error('Sound is no longer available')); const { result } = renderHook(useSaveSound, { wrapper }); await act(() => result.current.saveSound(id)); expect(result.current.error).toMatch(/no longer available/); expect(client.getQueryData(['sounds', 'saved-status', id, 'alice', 'profile-alice', 1])).toBeUndefined(); state.update.mockResolvedValue(false); await act(() => result.current.unsaveSound(id)); expect(result.current.error).toBe('');
});
it('ignores a successful response after the originating view unmounts', async () => {
  let done!: (value: boolean) => void; state.update.mockReturnValue(new Promise(resolve => { done = resolve; })); const { result, unmount } = renderHook(useSaveSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.saveSound(id); }); unmount(); await act(async () => { done(true); expect(await pending).toBeNull(); }); expect(client.getQueryData(['sounds', 'saved-status', id, 'alice', 'profile-alice', 1])).toBeUndefined();
});

it('turns a looping page receipt into a retryable error rather than a render crash', async () => {
  const cursor = 'a'.repeat(32); state.list.mockResolvedValueOnce({ entries: [], nextCursor: cursor }).mockResolvedValueOnce({ entries: [], nextCursor: cursor });
  const { result } = renderHook(useSavedSounds, { wrapper }); await waitFor(() => expect(result.current.hasNextPage).toBe(true)); await act(() => result.current.fetchNextPage()); await waitFor(() => expect(result.current.isError).toBe(true)); expect(result.current.entries).toBeUndefined(); expect(result.current.hasNextPage).toBe(false);
});
it('bounds automatic request rate while retaining every loaded legacy page without a scroll-window reset', async () => {
  for (const pages of [1, 10, 20, 30, 100, 500]) expect(pages * 60000 / savedSoundsRefreshInterval(pages)).toBeLessThanOrEqual(40);
  expect(savedSoundsRefreshInterval(1)).toBe(15000); expect(savedSoundsRefreshInterval(20)).toBe(30000);
  state.list.mockResolvedValue({ entries: [], nextCursor: null }); renderHook(useSavedSounds, { wrapper }); await waitFor(() => expect(state.list).toHaveBeenCalledOnce());
  const options = client.getQueryCache().getAll().find(query => query.queryKey[1] === 'saved')!.options;
  expect(options.maxPages).toBeUndefined(); expect(options.refetchOnWindowFocus).toBe('always');
  expect((options.refetchInterval as (query: unknown) => number)({ state: { data: { pages: Array.from({ length: 50 }) } } })).toBe(75000);
});
it('does not inherit Alice saved references or saved status under production query defaults after A-B-A', async () => {
  state.list.mockResolvedValue({ entries: [{ referenceId: id, soundId: id, legacy: false, sound: { sound_id: id, title: 'Alice saved sound' } }], nextCursor: null }); state.status.mockResolvedValue(true);
  const { result, rerender } = renderHook(() => ({ list: useSavedSounds(), status: useIsSoundSaved(id) }), { wrapper }); await waitFor(() => expect(result.current.list.data?.[0].title).toBe('Alice saved sound')); await waitFor(() => expect(result.current.status.data).toBe(true));
  state.list.mockReturnValue(new Promise(() => {})); state.status.mockReturnValue(new Promise(() => {}));
  state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' }; state.profile = { id: 'profile-bob', user_id: 'bob' }; rerender();
  expect(result.current.list.data).toBeUndefined(); expect(result.current.list.entries).toBeUndefined(); expect(result.current.status.data).toBeUndefined();
  state.session = { uid: 'alice', epoch: 3 }; state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; rerender();
  expect(result.current.list.data).toBeUndefined(); expect(result.current.list.entries).toBeUndefined(); expect(result.current.status.data).toBeUndefined();
});
it('reopens saved entries and status only after a fresh read, masking rejected admission despite an active old observer', async () => {
  state.list.mockResolvedValue({ entries: [{ referenceId: id, soundId: id, legacy: false, sound: { sound_id: id, title: 'Formerly available' } }], nextCursor: null }); state.status.mockResolvedValue(true);
  const useBoth = () => ({ list: useSavedSounds(), status: useIsSoundSaved(id) }); const keeper = renderHook(useBoth, { wrapper });
  await waitFor(() => expect(keeper.result.current.list.data).toHaveLength(1)); await waitFor(() => expect(keeper.result.current.status.data).toBe(true));
  let denyList!: (value: Error) => void, denyStatus!: (value: Error) => void;
  state.list.mockReturnValue(new Promise((_, reject) => { denyList = reject; })); state.status.mockReturnValue(new Promise((_, reject) => { denyStatus = reject; }));
  const reopened = renderHook(useBoth, { wrapper }); expect(reopened.result.current.list.entries).toBeUndefined(); expect(reopened.result.current.list.isLoading).toBe(true); expect(reopened.result.current.status.data).toBeUndefined();
  await act(async () => { denyList(new Error('Access changed')); denyStatus(new Error('Access changed')); });
  await waitFor(() => expect(reopened.result.current.list.isError).toBe(true)); expect(reopened.result.current.list.data).toBeUndefined(); expect(reopened.result.current.status.data).toBeUndefined();
  expect(client.getQueryCache().getAll().find(query => query.queryKey[1] === 'saved-status')!.options.refetchInterval).toBe(15000);
});
