import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraStoryPostSheet } from './CameraStoryPostSheet';

const mock = vi.hoisted(() => {
  const session = { uid: 'alice', epoch: 1 };
  return { session, native: session, user: { id: 'alice' } as { id: string } | null,
    locked: false, resolve: vi.fn(), submit: vi.fn(), reset: vi.fn(), success: vi.fn(), error: vi.fn(), haptic: vi.fn() };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.user }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => mock.native,
  reportAccountGuard: (uid: string) => { const captured = mock.native; return () => {
    if (!uid || uid !== mock.native.uid || captured !== mock.native) throw new Error('Your account changed.');
  }; },
}));
vi.mock('@/hooks/useStoryComposer', () => ({ useStoryComposer: () => ({ submit: mock.submit, locked: mock.locked, reset: mock.reset }) }));
vi.mock('@/lib/camera/resolveCaptureFile', () => ({ resolveCaptureFile: mock.resolve }));
vi.mock('@/lib/haptics', () => ({ triggerHaptic: mock.haptic }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const capture = () => new File(['capture-data'], 'capture.jpg', { type: 'image/jpeg' });
function setup() {
  const onComplete = vi.fn(); const onClose = vi.fn();
  const props = { mediaUrl: 'blob:original', mediaType: 'photo' as const, onComplete, onClose };
  return { ...render(<CameraStoryPostSheet {...props} />), props, onComplete, onClose };
}
beforeEach(() => {
  vi.clearAllMocks(); mock.user = { id: 'alice' }; mock.locked = false;
  mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
  mock.resolve.mockResolvedValue(capture()); mock.submit.mockResolvedValue({ id: 'story-1' });
});
afterEach(() => cleanup());

describe('Camera story publishing lifecycle', () => {
  it('releases Posting after capture fetch failure and retries without losing caption or audience', async () => {
    mock.resolve.mockRejectedValueOnce(new Error('Capture could not be loaded.')); const view = setup();
    fireEvent.change(screen.getByPlaceholderText('Add a caption…'), { target: { value: 'For my friends' } });
    fireEvent.click(screen.getByRole('switch', { name: 'Close Friends only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share to Story' })).toBeEnabled());
    expect(mock.error).toHaveBeenCalledWith('Capture could not be loaded.'); expect(mock.success).not.toHaveBeenCalled();
    expect(view.onComplete).not.toHaveBeenCalled(); expect(mock.submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    await waitFor(() => expect(view.onComplete).toHaveBeenCalledOnce());
    expect(mock.resolve).toHaveBeenCalledTimes(2); expect(mock.submit).toHaveBeenCalledWith(expect.objectContaining({ caption: 'For my friends', isCloseFriendsOnly: true, isVideo: false }));
  });

  it('allows only one pending submit and reports success only after the acknowledged story', async () => {
    const pending = deferred<{ id: string }>(); mock.submit.mockReturnValue(pending.promise); const view = setup();
    const button = screen.getByRole('button', { name: 'Share to Story' }); fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce());
    expect(mock.success).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Close story editor' })).toBeDisabled();
    await act(async () => pending.resolve({ id: 'story-1' }));
    expect(mock.success).toHaveBeenCalledOnce(); expect(view.onComplete).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'no-receipt'] as const)('does not claim publication when composer returns %s', async mode => {
    if (mode === 'reject') mock.submit.mockRejectedValue(new Error('Publication could not be confirmed.'));
    else mock.submit.mockResolvedValue(undefined);
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share to Story' })).toBeEnabled());
    expect(mock.success).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
  });

  it('ignores a result from a closed editor and prevents another account from reusing its capture', async () => {
    const pending = deferred<{ id: string }>(); mock.submit.mockReturnValue(pending.promise); const view = setup();
    fireEvent.change(screen.getByPlaceholderText('Add a caption…'), { target: { value: 'Private Alice caption' } });
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' })); await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce());
    mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.native = mock.session; mock.user = { id: 'bob' };
    view.rerender(<CameraStoryPostSheet {...view.props} />);
    await act(async () => pending.resolve({ id: 'story-1' }));
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText('Add a caption…')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Capture expired' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Close capture' })); expect(view.onClose).toHaveBeenCalledOnce();
  });

  it('does not submit after native ABA while capture resolution is pending before React rerenders', async () => {
    const pending = deferred<File>(); mock.resolve.mockReturnValue(pending.promise); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    mock.native = { uid: 'alice', epoch: mock.native.epoch + 2 };
    await act(async () => pending.resolve(capture()));
    expect(mock.submit).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
  });

  it('suppresses native account-change completions after a story receipt', async () => {
    const pending = deferred<{ id: string }>(); mock.submit.mockReturnValue(pending.promise); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Share to Story' })); await waitFor(() => expect(mock.submit).toHaveBeenCalledOnce());
    mock.native = { uid: 'bob', epoch: mock.native.epoch + 1 };
    await act(async () => pending.resolve({ id: 'story-1' }));
    expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
  });

  it('requires sign-in before resolving or submitting private media', () => {
    mock.user = null; setup(); fireEvent.click(screen.getByRole('button', { name: 'Share to Story' }));
    expect(mock.resolve).not.toHaveBeenCalled(); expect(mock.submit).not.toHaveBeenCalled(); expect(mock.error).toHaveBeenCalledWith('Sign in to post stories');
  });
});
