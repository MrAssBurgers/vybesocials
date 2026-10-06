import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  profileId: 'alice', ready: true, epoch: 1,
  entry: { status: 'ready', expires: 30_000, post: null } as { status: string; expires: number; post: Record<string, unknown> | null },
  from: vi.fn(), rpc: vi.fn(), reaction: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ profile: state.profileId ? { id: state.profileId } : null, user: state.profileId ? { id: `uid-${state.profileId}` } : null }) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: state.ready, session: { uid: `uid-${state.profileId}`, epoch: state.epoch }, guard: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from, rpc: state.rpc } }));
vi.mock('@/lib/postReactions', () => ({ getViewerPostReaction: state.reaction }));
vi.mock('@/hooks/usePostReaction', () => ({ usePostReaction: () => ({ isLiked: false, likeCount: 0, currentReaction: null, handleReaction: vi.fn() }) }));
vi.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: (url: string | null) => url }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobileOrTablet: () => ({ isMobileOrTablet: true }) }));
vi.mock('@/hooks/useInfinitePosts', () => ({ usePersonalizedFeed: () => ({ data: { pages: [] } }) }));
vi.mock('@/components/chat/SharedPostPreviews', () => ({ SharedPostPreviewProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useActivePostPreview: () => ({ entry: state.entry, retry: vi.fn() }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/profile/ProfileLink', () => ({ ProfileLink: ({ children }: { children: ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/reactions/ReactionPicker', () => ({ ReactionPicker: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/comments/CommentSheet', () => ({ CommentSheet: () => null }));
vi.mock('@/components/comments/InlineComments', () => ({ InlineComments: () => null }));
vi.mock('@/components/share/ShareSheet', () => ({ ShareSheet: () => null }));
vi.mock('@/components/share/HoldToShare', () => ({ HoldToShare: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock('@/components/clips/FollowPlusButton', () => ({ FollowPlusButton: () => null }));
vi.mock('@/components/clips/ClipVideoProgress', () => ({ ClipVideoProgress: () => null }));
vi.mock('@/components/explore/VideoCard', () => ({ VideoCard: () => null }));
// Test the real entry surfaces; the checked consent dialog has separate authority/lifecycle tests.
vi.mock('@/components/vybemap/MapPinDialogLoader', () => ({ MapPinDialogLoader: ({ sourceId, kind, onClose }: { sourceId: string; kind: string; onClose: () => void }) => <section role="dialog" aria-label="Map consent"><p>{kind}:{sourceId}</p><button onClick={onClose}>Cancel map consent</button></section> }));

import { MobileShortCard } from './MobileShortCard';
import Watch from '@/pages/Watch';

it('renders an extensionless admitted clip as video on mobile', () => {
  const view = render(<MobileShortCard post={{ ...clip, type: 'short', media_url: 'https://example.test/storage/opaque-id?alt=media' }} isActive />, { wrapper });
  expect(view.container.querySelector('video')?.getAttribute('src')).toBe('https://example.test/storage/opaque-id?alt=media');
});

const clip = { id: 'clip-one', media_url: 'https://example.test/clip.mp4', caption: 'A published clip', tags: [], author: { id: 'alice', username: 'alice', avatar_url: null }, like_count: 0, comment_count: 0, is_liked: false, is_bookmarked: false };
const video = { id: 'video-one', type: 'video', mediaUrl: 'https://example.test/video.mp4', caption: 'A published video', tags: [], createdAt: '2026-10-04T12:00:00.000Z', viewCount: 0, likeCount: 0, commentCount: 0, author: { id: 'alice', username: 'alice', avatarUrl: null }, publicationRevision: 'a'.repeat(48), needsOwnerConfirmation: false };
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>; }
function mountWatch() { return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/watch/video-one']}><Routes><Route path="/watch/:id" element={<Watch />} /></Routes></MemoryRouter></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks(); state.profileId = 'alice'; state.ready = true; state.epoch++;
  state.entry = { status: 'ready', expires: 30_000, post: video };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
  state.from.mockReturnValue(query); state.rpc.mockResolvedValue({ data: null, error: null }); state.reaction.mockResolvedValue({ is_liked: false, reaction_type: null });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });

describe('actual mobile clip playback lifecycle', () => {
  it('automatically retries an active network-failed clip without waiting for reconnect', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    await new Promise(resolve => setTimeout(resolve, 180));
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent.error(video);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2));
    fireEvent.loadedData(video);
    expect(screen.queryByRole('button', { name: 'Retry clip' })).not.toBeInTheDocument();
  });
  it('does not reload a departed clip or automatically retry unsupported media', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 4 } });
    fireEvent.error(video); fireEvent(window, new Event('online'));
    expect(load).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry clip' }));
    expect(load).toHaveBeenCalledOnce();
    view.rerender(<MobileShortCard post={clip} isActive={false} />);
    expect(video.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledTimes(2); // Release the departed decoder, without a source.
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent(window, new Event('online'));
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('recovers a network failure on foreground return without reloading in the background', async () => {
    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    await new Promise(resolve => setTimeout(resolve, 180));
    const video = view.container.querySelector('video')!;
    actVisibility('hidden');
    expect(video.hasAttribute('src')).toBe(false);
    expect(load).toHaveBeenCalledOnce(); // Release only; no background download.
    Object.defineProperty(video, 'error', { configurable: true, value: { code: 2 } });
    fireEvent(window, new Event('online')); expect(load).toHaveBeenCalledOnce();
    actVisibility('visible');
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
  it('starts one play request, including rerenders with the same account', async () => {
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    await waitFor(() => expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce());
    view.rerender(<MobileShortCard post={{ ...clip, caption: 'Updated caption' }} isActive />);
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledOnce();
    state.epoch++;
    view.rerender(<MobileShortCard post={clip} isActive />);
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(2);
  });
  it('pauses in the background and resumes only the active clip on return', async () => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    await new Promise(resolve => setTimeout(resolve, 180));
    const played = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    fireEvent(document, new Event('visibilitychange')); // Visible event alone must not restart.
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(played);
    actVisibility('hidden');
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    actVisibility('visible');
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(played + 1);
    view.rerender(<MobileShortCard post={clip} isActive={false} />);
    actVisibility('hidden'); actVisibility('visible');
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(played + 1);
  });
  it('keeps an explicitly paused clip paused after background/resume', async () => {
    const view = render(<MobileShortCard post={clip} isActive />, { wrapper });
    await new Promise(resolve => setTimeout(resolve, 180));
    const video = view.container.querySelector('video')!;
    Object.defineProperty(video, 'paused', { configurable: true, value: false });
    fireEvent.click(video);
    await new Promise(resolve => setTimeout(resolve, 350));
    const count = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    actVisibility('hidden'); actVisibility('visible');
    await new Promise(resolve => setTimeout(resolve, 180));
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(count);
  });
});
function actVisibility(value: string) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
  fireEvent(document, new Event('visibilitychange'));
}

describe('actual mobile clip map consent entry', () => {
  it('opens the exact clip consent only after owner action and supports cancellation', () => {
    render(<MobileShortCard post={clip} isActive={false} />, { wrapper });
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map sharing' }));
    expect(screen.getByRole('dialog', { name: 'Map consent' })).toHaveTextContent('clip:clip-one');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel map consent' }));
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it('does not offer another author’s clip to share on the map', () => {
    render(<MobileShortCard post={{ ...clip, author: { ...clip.author, id: 'bob' } }} isActive={false} />, { wrapper });
    expect(screen.queryByRole('button', { name: 'Map sharing' })).toBeNull();
  });
  it('removes an open owner dialog when the card changes to another author', () => {
    const view = render(<MobileShortCard post={clip} isActive={false} />, { wrapper });
    fireEvent.click(screen.getByRole('button', { name: 'Map sharing' }));
    view.rerender(<MobileShortCard post={{ ...clip, id: 'other', author: { ...clip.author, id: 'bob' } }} isActive={false} />);
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
  });
});

describe('actual long-video map consent entry', () => {
  it('opens a post-kind pin for the exact admitted long video and supports cancellation', async () => {
    mountWatch();
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Map sharing' }));
    expect(screen.getByRole('dialog', { name: 'Map consent' })).toHaveTextContent('post:video-one');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel map consent' }));
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
    await waitFor(() => expect(state.reaction).toHaveBeenCalledOnce());
  });
  it.each(['foreign', 'account-not-ready', 'source-unavailable'])('does not offer map publishing for %s', reason => {
    if (reason === 'foreign') state.profileId = 'bob';
    if (reason === 'account-not-ready') state.ready = false;
    if (reason === 'source-unavailable') state.entry = { status: 'unavailable', expires: 0, post: null };
    mountWatch();
    expect(screen.queryByRole('button', { name: 'Map sharing' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Map consent' })).toBeNull();
  });
});
