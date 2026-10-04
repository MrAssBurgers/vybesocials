import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ entry: { status: 'unavailable', expires: 0 } as any, retry: vi.fn(), feed: vi.fn(), from: vi.fn(), error: vi.fn(), rpc: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from, rpc: state.rpc } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: false, session: { uid: 'alice', epoch: 1 } }) }));
vi.mock('@/components/chat/SharedPostPreviews', () => ({ SharedPostPreviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useActivePostPreview: () => ({ entry: state.entry, retry: state.retry }) }));
vi.mock('@/hooks/useInfinitePosts', () => ({ usePersonalizedFeed: (...args: unknown[]) => state.feed(...args) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobileOrTablet: () => ({ isMobileOrTablet: false }) }));
vi.mock('@/hooks/usePostReaction', () => ({ usePostReaction: () => ({ isLiked: false, likeCount: 0, handleReaction: vi.fn() }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/explore/VideoCard', () => ({ VideoCard: () => null }));
vi.mock('@/components/comments/InlineComments', () => ({ InlineComments: () => <p>Comment area</p> }));
vi.mock('@/components/share/ShareSheet', () => ({ ShareSheet: () => null }));
vi.mock('@/components/share/HoldToShare', () => ({ HoldToShare: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('sonner', () => ({ toast: { error: state.error, success: vi.fn() } }));
import Watch from './Watch';
const post = { id: 'one', type: 'video', mediaUrl: 'https://example.test/clip.mp4', caption: 'Checked video', tags: [], createdAt: '2026-10-04T12:00:00.000Z', viewCount: 0, likeCount: 0, commentCount: 0, author: { id: 'bob', username: 'bob', avatarUrl: null } };
function mount() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/watch/one']}><Routes><Route path="/watch/:id" element={<Watch />} /><Route path="/clips/:id" element={<p>Clip viewer</p>} /><Route path="/p/:id" element={<p>Post detail</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); state.entry = { status: 'unavailable', expires: 0 }; state.feed.mockReturnValue({}); state.rpc.mockResolvedValue({}); vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(); vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const admit = () => { state.entry = { status: 'ready', expires: 30000, post }; };
describe('checked long-video page', () => {
  it('denies raw reads, recommendations and comments before admission', () => {
    const view = mount(); expect(screen.getByText('This video is unavailable')).toBeInTheDocument();
    expect(view.container.querySelector('video')).toBeNull(); expect(screen.queryByText('Comment area')).toBeNull();
    expect(state.from).not.toHaveBeenCalled(); expect(state.feed).toHaveBeenCalledWith('video', { enabled: false });
  });
  it('offers retry for a failed current-access read', () => {
    state.entry.status = 'error'; mount(); fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.retry).toHaveBeenCalledOnce();
  });
  it('keeps play controls paused if browser playback rejects', async () => {
    admit(); vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new Error('Blocked')); mount();
    fireEvent.click(screen.getByRole('button', { name: 'Resume video' }));
    await waitFor(() => expect(state.error).toHaveBeenCalledWith('Playback could not start. Try again.'));
    expect(screen.queryByRole('button', { name: 'Pause video' })).toBeNull();
  });
  it('seeks with a keyboard-accessible slider and ignores unknown duration', () => {
    admit(); const view = mount(); const video = view.container.querySelector('video')!;
    const seek = screen.getByRole('slider', { name: 'Video position' });
    fireEvent.change(seek, { target: { value: '50' } }); expect(video.currentTime).toBe(0);
    Object.defineProperty(video, 'duration', { configurable: true, value: 120 });
    fireEvent.change(seek, { target: { value: '25' } }); expect(video.currentTime).toBe(30);
    fireEvent.timeUpdate(video); expect(seek).toHaveValue('25');
    fireEvent.play(video); expect(screen.getByRole('button', { name: 'Pause video' })).toBeInTheDocument();
    fireEvent.pause(video); expect(screen.getByRole('button', { name: 'Resume video' })).toBeInTheDocument();
  });
  it.each([['short', 'Clip viewer'], ['post', 'Post detail']])('routes an admitted %s to its own viewer', (type, label) => {
    state.entry = { status: 'ready', expires: 30000, post: { ...post, type } }; mount(); expect(screen.getByText(label)).toBeInTheDocument();
  });
});
