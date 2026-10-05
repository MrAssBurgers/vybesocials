import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
const state = vi.hoisted(() => ({ publish: vi.fn(), request: vi.fn(), forget: vi.fn(), success: vi.fn(), session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'profile-alice', user_id: 'alice' } }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('sonner', () => ({ toast: { success: state.success } }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/lib/soundUploadService', () => ({ publishOriginalSound: state.publish, soundUploadRequest: state.request, forgetCancelledSoundAttempt: state.forget, captureSoundActor: (uid: string, profileId: string, view: () => void) => { const epoch = state.session.epoch; return { uid, profileId, guard: () => { view(); if (uid !== state.session.uid || epoch !== state.session.epoch) throw new Error('Account changed'); } }; } }));
import { useUploadSound } from './useUploadSound';
const input = { file: new File(['synthetic audio bytes'], 'test.wav', { type: 'audio/wav' }), title: 'Synthetic test', publicConsent: true };
const receipt = { uploadId: 'a'.repeat(64), soundId: 'a'.repeat(64), status: 'published' };
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); state.session = { uid: 'alice', epoch: 1 }; state.profile = { id: 'profile-alice', user_id: 'alice' }; }); afterEach(cleanup);
it('publishes only after the service confirms bytes and a durable receipt', async () => {
  let complete!: (value: unknown) => void; state.publish.mockImplementation((_input, _actor, _signal, progress) => { progress(45, 'Uploading audio bytes'); return new Promise(resolve => { complete = resolve; }); });
  const { result } = renderHook(useUploadSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.uploadSound(input); });
  expect(result.current.isUploading).toBe(true); expect(result.current.progress).toBe(45); expect(state.success).not.toHaveBeenCalled();
  await act(async () => { complete(receipt); expect(await pending).toBe(receipt); }); expect(state.success).toHaveBeenCalledWith('Your original sound is published.'); expect(result.current.isUploading).toBe(false);
});
it('retains an actionable failure and never promises XP or upload success', async () => {
  state.publish.mockRejectedValue(new Error('The audio bytes could not be checked. Retry.'));
  const { result } = renderHook(useUploadSound, { wrapper }); await act(() => result.current.uploadSound(input));
  expect(result.current.error).toMatch(/could not be checked/); expect(state.success).not.toHaveBeenCalled(); expect(result.current.isUploading).toBe(false);
});
it('aborts and suppresses late publication after an A-B-A transition', async () => {
  let complete!: (value: unknown) => void; let signal!: AbortSignal; state.publish.mockImplementation((_input, _actor, value) => { signal = value; return new Promise(resolve => { complete = resolve; }); });
  const { result, rerender } = renderHook(useUploadSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.uploadSound(input); });
  state.session = { uid: 'alice', epoch: 3 }; rerender(); expect(signal.aborted).toBe(true);
  await act(async () => { complete(receipt); expect(await pending).toBeNull(); }); expect(state.success).not.toHaveBeenCalled(); expect(result.current.error).toBe('');
});
it('rejects a captured old callback even before a new auth render', async () => {
  const { result } = renderHook(useUploadSound, { wrapper }); const oldUpload = result.current.uploadSound; state.session = { uid: 'alice', epoch: 3 };
  await act(() => oldUpload(input)); expect(state.publish).not.toHaveBeenCalled();
});
it('does not bind a current account to a stale profile', async () => {
  state.profile = { id: 'profile-bob', user_id: 'bob' }; const { result } = renderHook(useUploadSound, { wrapper }); await act(() => result.current.uploadSound(input)); expect(state.publish).not.toHaveBeenCalled();
});
it('confirms cancellation separately and does not erase a published result', async () => {
  state.publish.mockImplementation((_input, _actor, signal: AbortSignal, _progress, reserved) => { reserved(receipt); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')))); });
  state.request.mockResolvedValue(receipt); const { result } = renderHook(useUploadSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.uploadSound(input); });
  await act(async () => { await result.current.cancelUpload(); await pending; }); expect(state.request).toHaveBeenCalledWith(expect.anything(), { action: 'cancel', uploadId: receipt.uploadId }); expect(state.forget).not.toHaveBeenCalled(); expect(result.current.error).toMatch(/already published/);
});
it('aborts an unmounted upload without a late success notification', async () => {
  let complete!: (value: unknown) => void; let signal!: AbortSignal; state.publish.mockImplementation((_input, _actor, value) => { signal = value; return new Promise(resolve => { complete = resolve; }); });
  const { result, unmount } = renderHook(useUploadSound, { wrapper }); let pending!: Promise<unknown>; act(() => { pending = result.current.uploadSound(input); }); unmount(); expect(signal.aborted).toBe(true);
  await act(async () => { complete(receipt); await pending; }); expect(state.success).not.toHaveBeenCalled();
});
