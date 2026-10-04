import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ invoke: vi.fn(), success: vi.fn(), message: vi.fn(), error: vi.fn(), epoch: 1 }));
vi.mock('@/lib/firebase', () => ({ db: { functions: { invoke: state.invoke } } }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: 'alice', epoch: state.epoch }) }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'alice' } }) }));
vi.mock('sonner', () => ({ toast: { success: state.success, message: state.message, error: state.error } }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
import { useUploadSound } from './useUploadSound';
const input = { file: new File(['synthetic'], 'test.wav', { type: 'audio/wav' }), title: 'Synthetic test' };
beforeEach(() => { vi.clearAllMocks(); state.epoch = 1; }); afterEach(cleanup);
it('does not treat the real not-yet-ported domain payload as a successful upload', async () => {
  state.invoke.mockResolvedValue({ data: { ok: false, error: 'not_yet_ported' }, error: null });
  const { result } = renderHook(useUploadSound); let receipt: unknown; await act(async () => { receipt = await result.current.uploadSound(input); });
  expect(receipt).toBeNull(); expect(state.success).not.toHaveBeenCalled(); expect(state.message).toHaveBeenCalledWith(expect.stringContaining('has not been uploaded')); expect(result.current.progress).toBe(0);
});
it('does not accept metadata-only success as evidence that file bytes were uploaded', async () => {
  state.invoke.mockResolvedValue({ data: { ok: true, sound_id: 'claimed' }, error: null });
  const { result } = renderHook(useUploadSound); await act(() => result.current.uploadSound(input));
  expect(state.success).not.toHaveBeenCalled(); expect(state.message).toHaveBeenCalledWith(expect.stringContaining('could not be confirmed'));
});
it('suppresses a late result after account change and unmount', async () => {
  let resolve!: (value: unknown) => void; state.invoke.mockReturnValue(new Promise(yes => { resolve = yes; }));
  const { result, unmount } = renderHook(useUploadSound); let pending!: Promise<unknown>; act(() => { pending = result.current.uploadSound(input); });
  state.epoch = 3; unmount(); await act(async () => { resolve({ data: { ok: false } }); await pending; }); expect(state.message).not.toHaveBeenCalled(); expect(state.error).not.toHaveBeenCalled();
});
