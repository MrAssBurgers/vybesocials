import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopCreateStudio } from './DesktopCreateStudio';

const enqueue = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'auth-user' }, profile: { id: 'profile-user', user_id: 'auth-user', username: 'creator' } }) }));
vi.mock('@/lib/uploadQueue', () => ({ enqueuePostUpload: enqueue }));
vi.mock('@/lib/postPublishNavigation', () => ({ applyPostPublishNavigation: () => '/home' }));
vi.mock('@/contexts/cameraOverlaySafe', () => ({ useCameraOverlay: () => ({ openCamera: vi.fn() }) }));
vi.mock('@/contexts/cameraOverlayActions', () => ({ openCameraFromGesture: vi.fn() }));
vi.mock('@/components/ai/AICaptionGenerator', () => ({ AICaptionGenerator: () => null }));
vi.mock('@/components/ai/AIVideoGenerator', () => ({ AIVideoGenerator: () => null }));
vi.mock('@/components/ui/StyledUsername', () => ({ StyledUsername: () => <span>creator</span> }));
vi.mock('@/features/profile/components/PersonTagPicker', () => ({ PersonTagPicker: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  let id = 0;
  URL.createObjectURL = vi.fn(() => `blob:studio-${++id}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(onClose = vi.fn()) { return render(<MemoryRouter><DesktopCreateStudio onClose={onClose} /></MemoryRouter>); }

describe('desktop upload truthfulness and media lifecycle', () => {
  it('publishes a private post for the author only', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('button', { name: 'Private' }));
    await user.type(screen.getByPlaceholderText('Write a caption...'), 'Just for me');
    await user.click(screen.getByRole('button', { name: 'Post' }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'only_me', caption: 'Just for me' }), 'Just for me');
  });
  it('keeps the visible video URL alive after reading duration and cleans it on unmount', () => {
    const videos: HTMLVideoElement[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((...args: Parameters<typeof document.createElement>) => {
      const element = createElement(...args);
      if (args[0] === 'video') videos.push(element as HTMLVideoElement);
      return element;
    });
    const view = mount();
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['video'], 'capture.mp4', { type: 'video/mp4' })] } });
    const probe = videos.find(video => !video.isConnected)!;
    expect(probe).toBeDefined();
    Object.defineProperty(probe, 'duration', { value: 10, configurable: true });
    fireEvent.loadedMetadata(probe);
    expect(view.container.querySelector('video')?.getAttribute('src')).toBe('blob:studio-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studio-2');
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('blob:studio-1');
    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studio-1');
  });
  it('does not let a replaced video metadata probe change the new media type', () => {
    const videos: HTMLVideoElement[] = [];
    const createElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((...args: Parameters<typeof document.createElement>) => {
      const element = createElement(...args);
      if (args[0] === 'video') videos.push(element as HTMLVideoElement);
      return element;
    });
    const view = mount();
    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(['video'], 'capture.mp4', { type: 'video/mp4' })] } });
    const probe = videos.find(video => !video.isConnected)!;
    fireEvent.change(input, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } });
    expect(probe.onloadedmetadata).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studio-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:studio-2');
    expect(view.container.querySelector('video')).toBeNull();
  });
  it('disables the trim control until it can export trimmed bytes', async () => {
    const view = mount();
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(['video'], 'capture.mp4', { type: 'video/mp4' })] } });
    await userEvent.click(screen.getByRole('tab', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: 'Trim unavailable' })).toBeDisabled();
    expect(screen.getByText(/Trim videos before uploading/)).toBeInTheDocument();
  });
  it('enqueues only once when Post is clicked repeatedly before navigation', () => {
    const view = mount();
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } });
    const postButton = screen.getByRole('button', { name: 'Post' });
    act(() => { fireEvent.click(postButton); fireEvent.click(postButton); });
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Publishing…' })).toBeDisabled();
  });
  it('uses the parent close handler for safe direct-upload navigation', () => {
    const onClose = vi.fn(); mount(onClose);
    fireEvent.click(screen.getByRole('button', { name: 'Close Create Studio' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
  it('keeps the media draft editable if the account-bound queue cannot start', () => {
    enqueue.mockImplementationOnce(() => { throw new Error('Your account changed.'); });
    const view = mount();
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(['photo'], 'photo.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(screen.getByRole('button', { name: 'Post' })).not.toBeDisabled();
    expect(view.container.querySelector('img[src="blob:studio-1"]')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publishing…' })).toBeNull();
  });

});
