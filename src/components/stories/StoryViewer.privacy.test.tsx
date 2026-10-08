import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StoryViewer } from './StoryViewer';
import { StoryPollViewer } from './StoryPollViewer';
import type { Story, StoryGroup } from '@/hooks/useStories';

const mock = vi.hoisted(() => {
  const session = { uid: 'alice', epoch: 1 };
  return { session, native: session, ready: true, current: undefined as Story | undefined,
    loading: true, failed: false, refetch: vi.fn(), visible: vi.fn(), markViewed: vi.fn(),
    chat: vi.fn(), send: vi.fn(), success: vi.fn(), error: vi.fn(), signed: vi.fn(), remove: vi.fn() };
});
vi.mock('@/hooks/useStoryAccount', () => ({ useStoryAccount: () => {
  const captured = mock.session;
  return { session: captured, ready: mock.ready, profile: { id: 'profile-alice', user_id: 'alice' }, guard: () => {
    if (mock.native !== captured || !mock.ready) throw new Error('Account changed.');
  } };
} }));
vi.mock('@/hooks/useVisibleStory', () => ({ useVisibleStory: (id: string) => {
  mock.visible(id); return { data: mock.current, isLoading: mock.loading, isError: mock.failed, refetch: mock.refetch };
} }));
vi.mock('@/hooks/useStories', () => ({ useViewStory: () => ({ mutate: mock.markViewed }) }));
vi.mock('@/lib/firebase/chats', () => ({ createDmChat: mock.chat }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: mock.send }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: (url: string) => { mock.signed(url); return url; } }));
vi.mock('@/hooks/useShowAds', () => ({ useShowAds: () => ({ showAds: false }) }));
vi.mock('@/components/ads/AdUnit', () => ({ AdUnit: () => null }));
vi.mock('@/components/ads/FeedAdCard', () => ({ AD_SLOTS: {} }));
vi.mock('sonner', () => ({ toast: { success: mock.success, error: mock.error } }));
vi.mock('@/lib/deleteOwnStory', () => ({ deleteOwnStory: (...args: unknown[]) => mock.remove(...args) }));

const story = (id = 'story-bob'): Story => ({ id, author_id: 'profile-bob', media_url: `https://media.invalid/authorized-${id}.jpg`, media_type: 'image',
  caption: 'Current authorized caption', is_close_friends_only: true, view_count: 2, created_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 86_400_000).toISOString(), author: { id: 'profile-bob', username: 'fresh-bob', display_name: 'Current Bob', avatar_url: 'https://media.invalid/authorized-avatar.jpg' } });
const groups = (): StoryGroup[] => [{ user: { id: 'profile-bob', username: 'old-bob', display_name: 'Old private name', avatar_url: 'https://media.invalid/old-private-avatar.jpg' },
  stories: [{ ...story(), caption: 'OLD PRIVATE CAPTION', media_url: 'https://media.invalid/old-private-media.jpg' }], hasUnviewed: true },
{ user: { id: 'profile-cara', username: 'private-cara', display_name: 'Neighbor private name', avatar_url: 'https://media.invalid/neighbor-private-avatar.jpg' },
  stories: [{ ...story('story-cara'), author_id: 'profile-cara', caption: 'NEIGHBOR PRIVATE CAPTION' }], hasUnviewed: true }];
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const setup = () => { const onClose = vi.fn(); const props = { groups: groups(), initialGroupIndex: 0, onClose }; return { ...render(<StoryViewer {...props} />), props, onClose }; };
const reply = () => { fireEvent.change(screen.getByPlaceholderText('Reply to fresh-bob...'), { target: { value: 'My private reply' } }); fireEvent.click(screen.getByRole('button', { name: 'Send story reply' })); };
beforeEach(() => {
  vi.clearAllMocks(); mock.session = { uid: 'alice', epoch: mock.session.epoch + 1 }; mock.native = mock.session;
  mock.ready = true; mock.current = undefined; mock.loading = true; mock.failed = false;
  mock.chat.mockResolvedValue('chat-alice-bob'); mock.send.mockResolvedValue({ error: null });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('Story viewer current audience authority', () => {
  it('uses cached props only for IDs while access is pending, with an available close action', () => {
    const view = setup();
    expect(mock.visible).toHaveBeenCalledWith('story-bob'); expect(screen.getByRole('dialog', { name: 'Checking story access' })).toBeVisible();
    expect(document.querySelector('img,video')).toBeNull(); expect(screen.queryByText('OLD PRIVATE CAPTION')).toBeNull();
    expect(screen.queryByText('Old private name')).toBeNull(); expect(mock.markViewed).not.toHaveBeenCalled();
    expect(mock.signed.mock.calls.some(([value]) => typeof value === 'string' && value.includes('private'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Close stories' })); expect(view.onClose).toHaveBeenCalledOnce();
  });

  it('renders only the newly authorized media/author and no neighboring private previews', async () => {
    mock.current = story(); mock.loading = false; setup();
    await waitFor(() => expect(screen.getByText('Current authorized caption')).toBeVisible()); expect(screen.getByText('Current Bob')).toBeVisible();
    expect(document.querySelector('img[src="https://media.invalid/authorized-story-bob.jpg"]')).not.toBeNull();
    expect(screen.queryByText('OLD PRIVATE CAPTION')).toBeNull(); expect(screen.queryByText('Neighbor private name')).toBeNull();
    expect(mock.signed.mock.calls.some(([value]) => typeof value === 'string' && value.includes('private'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Next story group' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Story likes are currently unavailable' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete story' })).toBeNull();
  });

  it('deletes the signed-in story only after a second confirmation', async () => {
    const own = story('story-alice');
    own.author_id = 'profile-alice';
    own.author = { id: 'profile-alice', username: 'alice', display_name: 'Alice', avatar_url: null };
    mock.current = own; mock.loading = false; mock.remove.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<StoryViewer groups={[{ user: { id: 'profile-alice', username: 'alice', display_name: 'Alice', avatar_url: null }, stories: [own], hasUnviewed: false }]} initialGroupIndex={0} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete story' }));
    expect(mock.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm delete story' }));
    await waitFor(() => expect(mock.remove).toHaveBeenCalledWith('story-alice', expect.any(Function)));
    expect(mock.success).toHaveBeenCalledWith('Story deleted');
  });

  it.each(['denied', 'removed'] as const)('removes current playback immediately after %s without preserving an exiting slide', condition => {
    mock.current = story(); mock.loading = false; const view = setup();
    const media = document.querySelector('img[src="https://media.invalid/authorized-story-bob.jpg"]')!;
    if (condition === 'denied') mock.failed = true; else mock.current = undefined;
    view.rerender(<StoryViewer {...view.props} />);
    expect(media.isConnected).toBe(false); expect(document.querySelector('img,video')).toBeNull();
    expect(screen.queryByText('Current authorized caption')).toBeNull(); expect(screen.queryByPlaceholderText('Reply to fresh-bob...')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check again' })); expect(mock.refetch).toHaveBeenCalledOnce();
  });

  it('does not reuse the previous story result while another navigation ID is selected', () => {
    mock.current = story(); mock.loading = false; setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next story group' }));
    expect(mock.visible).toHaveBeenLastCalledWith('story-cara'); expect(document.querySelector('img,video')).toBeNull();
    expect(screen.queryByText('Current authorized caption')).toBeNull(); expect(screen.queryByText('NEIGHBOR PRIVATE CAPTION')).toBeNull();
  });

  it('marks an authorized story viewed once despite repeated audience refreshes and control updates', () => {
    mock.current = story(); mock.loading = false; const view = setup();
    expect(mock.markViewed).not.toHaveBeenCalled();
    const image = document.querySelector('img[src="https://media.invalid/authorized-story-bob.jpg"]')!;
    Object.defineProperty(image, 'naturalWidth', { value: 640 }); fireEvent.load(image);
    fireEvent.click(screen.getByRole('button', { name: 'Pause story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play story' }));
    mock.current = { ...mock.current }; view.rerender(<StoryViewer {...view.props} />);
    expect(mock.markViewed).toHaveBeenCalledOnce(); expect(mock.markViewed).toHaveBeenCalledWith('story-bob');
  });

  it('expires the viewer across account ABA instead of reopening props under the next session', () => {
    mock.current = story(); mock.loading = false; const view = setup();
    mock.session = { uid: 'alice', epoch: mock.session.epoch + 2 }; mock.native = mock.session;
    view.rerender(<StoryViewer {...view.props} />);
    expect(screen.getByText('Your account changed. Close stories and open them again.')).toBeVisible();
    expect(document.querySelector('img,video')).toBeNull(); expect(screen.queryByText('Current authorized caption')).toBeNull();
  });
});

describe('Story viewer waits for actual media playback', () => {
  it('holds progress through image failure/retry and preserves an explicit pause', () => {
    vi.useFakeTimers(); mock.current = story(); mock.loading = false; setup();
    const image = document.querySelector('img[src="https://media.invalid/authorized-story-bob.jpg"]')!;
    act(() => vi.advanceTimersByTime(6000)); expect(mock.visible).toHaveBeenLastCalledWith('story-bob');
    expect(mock.markViewed).not.toHaveBeenCalled(); expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    fireEvent.error(image); act(() => vi.advanceTimersByTime(6000)); expect(mock.visible).toHaveBeenLastCalledWith('story-bob');
    fireEvent.click(screen.getByRole('button', { name: 'Pause story' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry story media' }));
    const retried = document.querySelector('img[src="https://media.invalid/authorized-story-bob.jpg"]')!;
    Object.defineProperty(retried, 'naturalWidth', { value: 1 }); fireEvent.load(retried);
    act(() => vi.advanceTimersByTime(6000)); expect(mock.visible).toHaveBeenLastCalledWith('story-bob');
    expect(screen.getByRole('button', { name: 'Play story' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Play story' })); act(() => vi.advanceTimersByTime(5250));
    expect(mock.visible).toHaveBeenLastCalledWith('story-cara');
  });

  it('keeps a long video until its real end and reflects native playback progress', async () => {
    vi.useFakeTimers(); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    mock.current = { ...story(), media_type: 'video', media_url: 'https://media.invalid/current.mp4' }; mock.loading = false; setup();
    const video = document.querySelector('video')!; fireEvent.loadedData(video); fireEvent.playing(video);
    act(() => vi.advanceTimersByTime(16000)); expect(mock.visible).toHaveBeenLastCalledWith('story-bob');
    Object.defineProperty(video, 'duration', { value: 60 }); video.currentTime = 30; fireEvent.timeUpdate(video);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    fireEvent.ended(video); expect(mock.visible).toHaveBeenLastCalledWith('story-cara');
    await act(async () => {});
  });

  it('preserves the user pause across an admission failure and same-story recheck', () => {
    mock.current = story(); mock.loading = false; const view = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Pause story' }));
    mock.failed = true; view.rerender(<StoryViewer {...view.props} />);
    expect(document.querySelector('video,img')).toBeNull();
    mock.failed = false; view.rerender(<StoryViewer {...view.props} />);
    expect(screen.getByRole('button', { name: 'Play story' })).toBeEnabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('Story replies remain tied to their authorized story and account', () => {
  it.each(['account', 'revocation'] as const)('does not send after %s changes during conversation creation', async change => {
    const pending = deferred<string>(); mock.chat.mockReturnValue(pending.promise); mock.current = story(); mock.loading = false;
    const view = setup(); reply(); expect(mock.chat).toHaveBeenCalledOnce();
    if (change === 'account') mock.native = { uid: 'alice', epoch: mock.session.epoch + 2 };
    else { mock.failed = true; view.rerender(<StoryViewer {...view.props} />); }
    await act(async () => pending.resolve('chat-alice-bob'));
    expect(mock.send).not.toHaveBeenCalled(); expect(mock.success).not.toHaveBeenCalled(); expect(mock.error).not.toHaveBeenCalled();
    expect(() => mock.chat.mock.calls[0][1]()).toThrow();
  });

  it('prevents duplicate taps and confirms only the acknowledged reply', async () => {
    const pending = deferred<{ error: null }>(); mock.send.mockReturnValue(pending.promise); mock.current = story(); mock.loading = false; setup();
    reply(); const button = screen.getByRole('button', { name: 'Send story reply' }); fireEvent.click(button);
    await waitFor(() => expect(mock.send).toHaveBeenCalledOnce()); expect(mock.chat).toHaveBeenCalledOnce(); expect(mock.success).not.toHaveBeenCalled();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'profile-alice', content: expect.stringContaining('My private reply') }), expect.objectContaining({ accountGuard: expect.any(Function) }));
    await act(async () => pending.resolve({ error: null })); expect(mock.success).toHaveBeenCalledWith('Reply sent!');
  });

  it('reuses an unchanged reply request after an unknown send result', async () => {
    mock.send.mockResolvedValueOnce({ error: new Error('Lost reply response.') }).mockResolvedValue({ error: null });
    mock.current = story(); mock.loading = false; setup(); reply();
    await waitFor(() => expect(mock.error).toHaveBeenCalledOnce()); expect(mock.success).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send story reply' }));
    await waitFor(() => expect(mock.success).toHaveBeenCalledOnce());
    expect(mock.send.mock.calls[1][0].client_message_id).toBe(mock.send.mock.calls[0][0].client_message_id);
  });
});

describe('Story engagement preview is truthful', () => {
  it.each(['poll', 'question'] as const)('shows authored %s content without pretending to submit a response', async type => {
    render(<StoryPollViewer storyId="story" isOwner={false} pollData={{ type, question: 'Which route?', options: type === 'poll' ? ['Left', 'Right'] : [] }} />);
    await waitFor(() => expect(screen.getByText('Which route?')).toBeVisible());
    expect(screen.getByText(type === 'poll' ? 'Poll voting is currently unavailable.' : 'Question responses are currently unavailable.')).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull(); expect(screen.queryByRole('textbox')).toBeNull();
    expect(mock.success).not.toHaveBeenCalled();
  });
});
