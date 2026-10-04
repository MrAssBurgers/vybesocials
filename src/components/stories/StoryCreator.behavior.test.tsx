import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryCreator } from './StoryCreator';

const mock = vi.hoisted(() => {
  const session = { uid: 'alice', epoch: 1 };
  return { session, native: session, validate: vi.fn(), thumbnail: vi.fn(), compress: vi.fn(), submit: vi.fn(), reset: vi.fn(),
    success: vi.fn(), error: vi.fn(), createUrl: vi.fn(), revokeUrl: vi.fn(), busy: false, locked: false };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: mock.session.uid }, loading: false }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => mock.native,
  reportAccountGuard: (uid: string) => { const captured = mock.native; return () => {
    if (!uid || mock.native !== captured || mock.native.uid !== uid) throw new Error('Your account changed.');
  }; } }));
vi.mock('@/hooks/useStoryComposer', () => ({ useStoryComposer: () => ({ submit: mock.submit, reset: mock.reset, busy: mock.busy, locked: mock.locked }) }));
vi.mock('@/lib/storyUtils', () => ({ validateStoryMedia: mock.validate, generateStoryThumbnail: mock.thumbnail,
  compressImage: mock.compress, inferStoryMediaKind: (file: File) => file.type.startsWith('video/') ? 'video' : 'image' }));
vi.mock('@/contexts/cameraOverlaySafe', () => ({ useCameraOverlay: () => ({ openCamera: vi.fn() }) }));
vi.mock('@/contexts/cameraOverlayActions', () => ({ openSnapCamera: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (value: string) => value }) }));
vi.mock('./StoryPollEditor', () => ({ StoryPollEditor: () => null }));

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const photo = (name: string) => new File([name], `${name}.jpg`, { type: 'image/jpeg' });
const select = (file: File) => fireEvent.change(screen.getByLabelText('Choose story photo or video'), { target: { files: [file] } });
beforeEach(() => {
  vi.clearAllMocks(); mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
  mock.busy = false; mock.locked = false; mock.validate.mockResolvedValue({ valid: true, aspectRatio: 1, duration: null });
  mock.thumbnail.mockResolvedValue(new Blob(['cover'])); mock.compress.mockImplementation(async file => file);
  mock.submit.mockResolvedValue({ id: 'story-1' }); let counter = 0;
  mock.createUrl.mockImplementation(() => `blob:preview-${++counter}`);
  vi.stubGlobal('URL', class extends URL { static createObjectURL = mock.createUrl; static revokeObjectURL = mock.revokeUrl; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Story editor selection and asynchronous covers', () => {
  it('does not let an old account automatic cover replace the current editor cover', async () => {
    const firstCover = deferred<Blob>(); const latestCover = new Blob(['new cover']);
    mock.thumbnail.mockReturnValueOnce(firstCover.promise).mockResolvedValueOnce(latestCover);
    const view = render(<StoryCreator onClose={vi.fn()} />); select(photo('old'));
    await screen.findByAltText('Preview');
    mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
    view.rerender(<StoryCreator onClose={vi.fn()} />); select(photo('new'));
    await waitFor(() => expect(mock.thumbnail).toHaveBeenCalledTimes(2));
    await act(async () => firstCover.resolve(new Blob(['stale cover'])));
    fireEvent.click(screen.getByRole('button', { name: 'stories.share' }));
    await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce());
    expect(mock.submit.mock.calls[0][0]).toMatchObject({ file: expect.objectContaining({ name: 'new.jpg' }), thumbnailBlob: latestCover });
  });

  it('clears the previous valid file when its replacement is invalid, including after Try Again', async () => {
    mock.validate.mockResolvedValueOnce({ valid: true, aspectRatio: 1 }).mockResolvedValueOnce({ valid: false, error: 'This replacement is invalid.' });
    render(<StoryCreator onClose={vi.fn()} />); select(photo('old')); await screen.findByAltText('Preview');
    select(photo('invalid')); await screen.findByText('This replacement is invalid.');
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.queryByAltText('Preview')).toBeNull(); expect(screen.queryByRole('button', { name: 'stories.share' })).toBeNull();
    expect(mock.submit).not.toHaveBeenCalled(); expect(mock.revokeUrl).toHaveBeenCalled();
  });

  it('does not retain a pending cover after its editor closes', async () => {
    const cover = deferred<Blob>(); mock.thumbnail.mockReturnValueOnce(cover.promise);
    const view = render(<StoryCreator onClose={vi.fn()} />); select(photo('old')); await screen.findByAltText('Preview');
    view.unmount();
    const urlsBefore = mock.createUrl.mock.calls.length;
    await act(async () => cover.resolve(new Blob(['late cover'])));
    expect(screen.queryByAltText('Preview')).toBeNull(); expect(mock.createUrl).toHaveBeenCalledTimes(urlsBefore);
    expect(mock.submit).not.toHaveBeenCalled();
  });

  it('waits for a selected cover image to finish processing before sharing', async () => {
    const cover = deferred<Blob>(); mock.compress.mockReturnValueOnce(cover.promise);
    render(<StoryCreator onClose={vi.fn()} />); select(photo('main')); await screen.findByAltText('Preview');
    fireEvent.click(screen.getByRole('button', { name: 'Cover' }));
    const input = document.querySelector('input[type="file"][accept="image/*"]')!;
    fireEvent.change(input, { target: { files: [photo('selected-cover')] } });
    const share = screen.getByRole('button', { name: /^Preparing cover/ });
    expect(share).toBeDisabled(); fireEvent.click(share); expect(mock.submit).not.toHaveBeenCalled();
    const chosen = new Blob(['chosen cover']); await act(async () => cover.resolve(chosen));
    await waitFor(() => expect(screen.getByRole('button', { name: 'stories.share' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'stories.share' }));
    await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce()); expect(mock.submit.mock.calls[0][0].thumbnailBlob).toBe(chosen);
  });

  it('suppresses a late error from the old account before React remounts', async () => {
    const pending = deferred<{ id: string }>(); mock.submit.mockReturnValueOnce(pending.promise);
    const onClose = vi.fn(); render(<StoryCreator onClose={onClose} />); select(photo('main')); await screen.findByAltText('Preview');
    mock.success.mockClear(); fireEvent.click(screen.getByRole('button', { name: 'stories.share' }));
    await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce());
    mock.native = { uid: 'alice', epoch: mock.session.epoch + 2 };
    await act(async () => pending.reject(new Error('Your account changed.')));
    expect(mock.error).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(onClose).not.toHaveBeenCalled();
  });

  it('discards pending media validation when account change remounts the editor', async () => {
    const pending = deferred<{ valid: boolean; aspectRatio: number }>(); mock.validate.mockReturnValueOnce(pending.promise);
    const view = render(<StoryCreator onClose={vi.fn()} />); select(photo('alice-private'));
    mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
    view.rerender(<StoryCreator onClose={vi.fn()} />);
    await act(async () => pending.resolve({ valid: true, aspectRatio: 1 }));
    expect(mock.createUrl).not.toHaveBeenCalled(); expect(mock.thumbnail).not.toHaveBeenCalled();
    expect(mock.success).not.toHaveBeenCalled(); expect(screen.queryByAltText('Preview')).toBeNull();
  });
});
