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
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.profile = { id: 'profile-alice', user_id: 'alice' }; client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); }); afterEach(() => { cleanup(); client.clear(); });
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
