import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraShareSheet } from './CameraShareSheet';

const mock = vi.hoisted(() => {
  const session = { uid: 'alice', epoch: 1 };
  return { session, native: session, user: { id: 'alice' } as { id: string } | null,
    profile: { id: 'profile-alice', user_id: 'alice' }, locked: false, chatsFailed: false,
    resolve: vi.fn(), submit: vi.fn(), check: vi.fn(), send: vi.fn(), toast: vi.fn(), navigate: vi.fn(),
    createUrl: vi.fn(), revokeUrl: vi.fn() };
});
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: mock.user, profile: mock.profile }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => mock.profile.id }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => mock.session }));
vi.mock('@/lib/reportModerationService', () => ({
  reportAccountSnapshot: () => mock.native,
  reportAccountGuard: (uid: string) => { const captured = mock.native; return () => {
    if (!uid || uid !== mock.native.uid || captured !== mock.native) throw new Error('Your account changed.');
  }; },
}));
vi.mock('@/hooks/useStoryComposer', () => ({ useStoryComposer: () => ({ submit: mock.submit, locked: mock.locked, reset: vi.fn() }) }));
vi.mock('@/hooks/useMessages', () => ({ useConversations: () => ({ isError: mock.chatsFailed, data: [{
  id: 'chat-bob', members: [{ profile: { id: 'profile-alice', display_name: 'Alice' } },
    { profile: { id: 'profile-bob', display_name: 'Bob' } }],
}] }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mock.toast }) }));
vi.mock('@/lib/camera/resolveCaptureFile', () => ({ resolveCaptureFile: mock.resolve }));
vi.mock('@/lib/camera/snapSendService', () => ({ startSnapSend: mock.send }));
vi.mock('@/lib/vybeCheck/runPublishVybeCheck', () => ({ runPublishVybeCheck: mock.check }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mock.navigate }));
vi.mock('@/components/safety/VybeCheckFailed', () => ({ VybeCheckFailed: ({ message }: { message: string }) => <div role="alert">{message}</div> }));

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const capture = () => new File(['capture-data'], 'capture.mp4', { type: 'video/mp4' });
function setup() {
  const onComplete = vi.fn(); const onClose = vi.fn();
  const props = { mediaUrl: 'blob:original-capture', mediaType: 'video' as const, soundId: 'sound-1', soundStartTime: 3.5, onComplete, onClose };
  return { ...render(<CameraShareSheet {...props} />), props, onComplete, onClose };
}
const chooseDM = () => { fireEvent.click(screen.getByRole('button', { name: 'Send to DM' })); fireEvent.click(screen.getByRole('button', { name: /Bob$/ })); };
beforeEach(() => {
  vi.clearAllMocks(); mock.user = { id: 'alice' }; mock.profile = { id: 'profile-alice', user_id: 'alice' };
  mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.native = mock.session; mock.locked = false; mock.chatsFailed = false;
  mock.resolve.mockResolvedValue(capture()); mock.submit.mockResolvedValue({ id: 'story-1' });
  mock.check.mockResolvedValue({ allowed: true, blocked: false }); mock.send.mockReturnValue('job-1');
  mock.createUrl.mockReturnValue('blob:handoff');
  vi.stubGlobal('URL', class extends URL { static createObjectURL = mock.createUrl; static revokeObjectURL = mock.revokeUrl; });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('Camera sharing confirms only completed actions', () => {
  it('releases Preparing after capture fetch failure and retries the file without reporting success', async () => {
    mock.resolve.mockRejectedValueOnce(new Error('Capture could not be loaded.'));
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Add to Story' })); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share Now' })).toBeEnabled());
    expect(mock.submit).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    expect(document.body).not.toHaveAttribute('data-story-upload-active');
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Capture could not be loaded.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(view.onComplete).toHaveBeenCalledOnce()); expect(mock.resolve).toHaveBeenCalledTimes(2);
  });

  it('keeps duplicate submit taps to one story action while file resolution is pending', async () => {
    const pending = deferred<File>(); mock.resolve.mockReturnValue(pending.promise); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Story' }));
    const button = screen.getByRole('button', { name: 'Share Now' }); fireEvent.click(button); fireEvent.click(button);
    expect(mock.resolve).toHaveBeenCalledOnce(); expect(view.onComplete).not.toHaveBeenCalled();
    await act(async () => pending.resolve(capture())); await waitFor(() => expect(view.onComplete).toHaveBeenCalledOnce());
    expect(mock.submit).toHaveBeenCalledOnce();
  });

  it('sends only the selected account conversation after moderation and describes pending delivery truthfully', async () => {
    const pending = deferred<{ allowed: boolean; blocked: boolean }>(); mock.check.mockReturnValue(pending.promise);
    const view = setup(); chooseDM(); fireEvent.change(screen.getByPlaceholderText('Write a caption...'), { target: { value: ' Hello ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Share Now' })); await waitFor(() => expect(mock.check).toHaveBeenCalledOnce());
    expect(mock.send).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    await act(async () => pending.resolve({ allowed: true, blocked: false }));
    await waitFor(() => expect(mock.send).toHaveBeenCalledOnce());
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ authUserId: 'alice', senderId: 'profile-alice', caption: 'Hello',
      draft: expect.objectContaining({ conversationIds: ['chat-bob'], mediaType: 'video' }) }));
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Messages are sending; check delivery progress.' }));
  });

  it.each(['blocked', 'unavailable'] as const)('does not send or claim DM success when moderation is %s', async failure => {
    if (failure === 'blocked') mock.check.mockResolvedValue({ blocked: true, allowed: false, message: 'Not approved.' });
    else mock.check.mockRejectedValue(new Error('Checking is unavailable. Try later.'));
    const view = setup(); chooseDM(); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(failure === 'blocked' ? screen.getByRole('alert') : mock.toast.mock.calls.length).toBeTruthy());
    expect(mock.send).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    expect(mock.toast.mock.calls.some(([value]) => value.title === 'Capture ready')).toBe(false);
  });

  it('revokes the handoff URL and keeps the sheet open if the send service rejects', async () => {
    mock.send.mockImplementation(() => { throw new Error('Send could not start.'); }); const view = setup(); chooseDM();
    fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share Now' })).toBeEnabled());
    expect(mock.revokeUrl).toHaveBeenCalledWith('blob:handoff'); expect(view.onComplete).not.toHaveBeenCalled();
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Send could not start.' }));
  });

  it('does not repeat an acknowledged story when a later DM destination fails and is retried', async () => {
    mock.check.mockRejectedValueOnce(new Error('Try checking again.')).mockResolvedValue({ allowed: true, blocked: false });
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Add to Story' })); chooseDM();
    fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Your story is already posted. Try checking again.' })));
    expect(view.onComplete).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(view.onComplete).toHaveBeenCalledOnce()); expect(mock.submit).toHaveBeenCalledOnce(); expect(mock.send).toHaveBeenCalledOnce();
  });

  it('hands the original File, caption and sound to the Clip composer without claiming publication', async () => {
    const file = capture(); mock.resolve.mockResolvedValue(file); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Story' })); fireEvent.click(screen.getByRole('button', { name: 'Continue to Clip' }));
    expect(screen.getByRole('button', { name: 'Add to Story' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.change(screen.getByPlaceholderText('Write a caption...'), { target: { value: ' My clip ' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Continue to Clip' }).at(-1)!);
    await waitFor(() => expect(mock.navigate).toHaveBeenCalledWith('/upload', { state: { prefillMedia: { file, url: 'blob:handoff', type: 'video' },
      captureTarget: 'clip', prefillCaption: 'My clip', selectedSoundId: 'sound-1', soundStartTime: 3.5 } }));
    expect(view.onComplete).toHaveBeenCalledOnce(); expect(mock.submit).not.toHaveBeenCalled(); expect(mock.check).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.toast).not.toHaveBeenCalled(); expect(mock.revokeUrl).not.toHaveBeenCalled();
  });

  it('starts a browser download, names the file and does not claim device save confirmation', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.href).toBe('blob:handoff'); expect(this.download).toBe('capture.mp4');
    }); const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Save to Device' })); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(view.onComplete).toHaveBeenCalledOnce()); expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Download started; check your device downloads.' }));
  });

  it('does not report a saved capture when the browser rejects starting the download', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('Download blocked.'); });
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Save to Device' })); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(mock.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive', description: 'Download blocked.' })));
    expect(view.onComplete).not.toHaveBeenCalled(); expect(document.querySelector('a[download]')).toBeNull();
  });

  it('rejects account changes before a delayed check can enqueue a message', async () => {
    const pending = deferred<{ allowed: boolean; blocked: boolean }>(); mock.check.mockReturnValue(pending.promise);
    const view = setup(); chooseDM(); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    await waitFor(() => expect(mock.check).toHaveBeenCalledOnce());
    mock.native = { uid: 'alice', epoch: mock.native.epoch + 2 };
    await act(async () => pending.resolve({ allowed: true, blocked: false }));
    expect(mock.send).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled(); expect(mock.toast).not.toHaveBeenCalled();
  });

  it.each(['Save to Device', 'Continue to Clip'])('refuses stale %s after native ABA before React rerenders', async destination => {
    const pending = deferred<File>(); mock.resolve.mockReturnValue(pending.promise); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: destination }));
    fireEvent.click(destination === 'Continue to Clip' ? screen.getAllByRole('button', { name: destination }).at(-1)! : screen.getByRole('button', { name: 'Share Now' }));
    mock.native = { uid: 'alice', epoch: mock.native.epoch + 2 };
    await act(async () => pending.resolve(capture()));
    expect(mock.createUrl).not.toHaveBeenCalled(); expect(mock.navigate).not.toHaveBeenCalled();
    expect(mock.toast).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
  });

  it('expires the original capture after an account switch instead of adopting it into the new account', async () => {
    const pending = deferred<File>(); mock.resolve.mockReturnValue(pending.promise); const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add to Story' })); fireEvent.click(screen.getByRole('button', { name: 'Share Now' }));
    mock.session = { uid: 'bob', epoch: mock.session.epoch + 1 }; mock.native = mock.session; mock.user = { id: 'bob' };
    view.rerender(<CameraShareSheet {...view.props} />);
    await act(async () => pending.resolve(capture()));
    expect(mock.submit).not.toHaveBeenCalled(); expect(mock.toast).not.toHaveBeenCalled(); expect(view.onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Capture expired' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Share Now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close capture' })); expect(view.onClose).toHaveBeenCalledOnce();
  });
});
