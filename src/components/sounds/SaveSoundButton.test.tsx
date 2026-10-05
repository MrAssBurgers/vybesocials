import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn(), removeLegacy: vi.fn(), refetch: vi.fn(), pending: false, error: '', statusError: false, status: undefined as boolean | undefined, session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session }));
vi.mock('@/hooks/useSounds', () => ({ useSaveSound: () => ({ saveSound: state.save, unsaveSound: state.remove, removeLegacy: state.removeLegacy, pending: state.pending, error: state.error }), useIsSoundSaved: () => ({ data: state.status, isError: state.statusError, refetch: state.refetch }) }));
import { SaveSoundButton } from './SaveSoundButton';
import { SavedSoundUnavailable } from './SavedSoundUnavailable';
beforeEach(() => { vi.clearAllMocks(); state.pending = false; state.error = ''; state.statusError = false; state.status = undefined; state.session = { uid: 'alice', epoch: 1 }; }); afterEach(cleanup);
it('does not render a false unsaved state while loading or after a status error', () => {
  const { rerender } = render(<SaveSoundButton soundId="sound" />); expect(screen.getByRole('button', { name: 'Loading saved status' })).toBeDisabled();
  state.statusError = true; rerender(<SaveSoundButton soundId="sound" />); expect(screen.queryByRole('button', { name: 'Save sound' })).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retry saved status' })); expect(state.refetch).toHaveBeenCalledOnce();
});
it('waits for the real acknowledgement and uses its current saved state', async () => {
  let resolve!: (value: boolean) => void; state.save.mockReturnValue(new Promise(done => { resolve = done; })); render(<SaveSoundButton soundId="sound" saved={false} />); fireEvent.click(screen.getByRole('button', { name: 'Save sound' })); expect(screen.getByRole('button', { name: 'Save sound' })).toHaveAttribute('aria-pressed', 'false');
  await act(async () => resolve(true)); expect(screen.getByRole('button', { name: 'Remove saved sound' })).toHaveAttribute('aria-pressed', 'true'); state.remove.mockResolvedValue(true); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove saved sound' }))); expect(screen.getByRole('button', { name: 'Remove saved sound' })).toBeInTheDocument();
});
it('keeps the confirmed preference and displays failure so the same action can be retried', async () => {
  state.remove.mockResolvedValue(null); state.error = 'Remove could not be confirmed. Retry.'; render(<SaveSoundButton soundId="sound" saved />); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove saved sound' })));
  expect(screen.getByRole('alert')).toHaveTextContent('Remove could not be confirmed'); expect(screen.getByRole('button', { name: 'Remove saved sound' })).toHaveAttribute('aria-pressed', 'true');
});
it('does not change a new account view from a retired save acknowledgement', async () => {
  let resolve!: (value: boolean) => void; state.save.mockReturnValue(new Promise(done => { resolve = done; })); const { rerender } = render(<SaveSoundButton soundId="sound" saved={false} />); fireEvent.click(screen.getByRole('button', { name: 'Save sound' }));
  state.session = { uid: 'alice', epoch: 3 }; rerender(<SaveSoundButton soundId="sound" saved={false} />); await act(async () => resolve(true)); expect(screen.getByRole('button', { name: 'Save sound' })).toHaveAttribute('aria-pressed', 'false');
});
it('removes unavailable references only on an explicit click and never renders media', async () => {
  const { container } = render(<SavedSoundUnavailable entry={{ referenceId: 'ref', soundId: 'sound', legacy: false, sound: null }} />); expect(state.remove).not.toHaveBeenCalled(); expect(container.querySelector('audio,video,img,iframe')).toBeNull(); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove reference' }))); expect(state.remove).toHaveBeenCalledWith('sound');
});
it('treats legacy rows as unverified cleanup references rather than restored audio', async () => {
  render(<SavedSoundUnavailable entry={{ referenceId: 'old-reference', soundId: null, legacy: true, sound: null }} />); expect(screen.getByText(/older reference cannot be verified/)).toBeInTheDocument(); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove reference' }))); expect(state.removeLegacy).toHaveBeenCalledWith('old-reference'); expect(state.remove).not.toHaveBeenCalled();
});
