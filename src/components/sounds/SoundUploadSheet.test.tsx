import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ upload: vi.fn(), cancel: vi.fn(), error: '', session: { uid: 'alice', epoch: 1 } }));
vi.mock('@/hooks/useUploadSound', () => ({ useUploadSound: () => ({ uploadSound: state.upload, cancelUpload: state.cancel, isUploading: false, error: state.error, progress: 0, stage: '' }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/soundUploadService', () => ({ soundContentType: (file: File) => file.type === 'audio/wav' ? file.type : '' }));
import { SoundUploadSheet } from './SoundUploadSheet';
const file = new File(['synthetic WAV bytes'], 'original.wav', { type: 'audio/wav' });
function select() { fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [file] } }); }
beforeEach(() => { vi.clearAllMocks(); state.error = ''; state.session = { uid: 'alice', epoch: 1 }; }); afterEach(cleanup);
it('does not publish on selection and requires explicit public sharing', async () => {
  const close = vi.fn(), published = vi.fn(); state.upload.mockResolvedValue({ soundId: 'confirmed' }); render(<SoundUploadSheet open onClose={close} onPublished={published} />); select();
  expect(state.upload).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Publish sound' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox')); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Publish sound' })));
  expect(state.upload).toHaveBeenCalledWith({ file, title: 'original', tags: [], publicConsent: true }); expect(published).toHaveBeenCalledWith('confirmed'); expect(close).toHaveBeenCalledOnce();
});
it('preserves selected bytes and title after publication failure for retry', async () => {
  const close = vi.fn(); state.upload.mockResolvedValue(null); state.error = 'Checking failed. Retry with the same file.'; render(<SoundUploadSheet open onClose={close} />); select(); fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'My recording' } }); fireEvent.click(screen.getByRole('checkbox'));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Publish sound' })));
  expect(close).not.toHaveBeenCalled(); expect(screen.getByLabelText('Title')).toHaveValue('My recording'); expect(screen.getByText(/original.wav/)).toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('Checking failed');
});
it('discards account-retired form data and suppresses its late success callback', async () => {
  let complete!: (value: unknown) => void; state.upload.mockReturnValue(new Promise(resolve => { complete = resolve; })); const close = vi.fn(), published = vi.fn(); const { rerender } = render(<SoundUploadSheet open onClose={close} onPublished={published} />); select(); fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Publish sound' }));
  state.session = { uid: 'alice', epoch: 3 }; rerender(<SoundUploadSheet open onClose={close} onPublished={published} />); await act(async () => complete({ soundId: 'old-result' }));
  expect(screen.getByLabelText('Title')).toHaveValue(''); expect(published).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
