import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const state = vi.hoisted(() => ({ mobile: false, entry: { status: 'unavailable', expires: 0 } as any, retry: vi.fn(), feed: vi.fn(), from: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: { from: state.from } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: false, session: { uid: 'alice', epoch: 1 } }) }));
vi.mock('@/components/chat/SharedPostPreviews', () => ({ SharedPostPreviewProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useActivePostPreview: () => ({ entry: state.entry, retry: state.retry }) }));
vi.mock('@/hooks/useSocialFeed', () => ({ useSocialFeed: (...args: unknown[]) => state.feed(...args) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobileOrTablet: () => ({ isMobileOrTablet: state.mobile }) }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('@/components/posts/ShortCard', () => ({ ShortCard: ({ post, isActive }: { post: { id: string }; isActive: boolean }) => <div data-testid="clip" data-active={isActive}>{post.id}</div> }));
vi.mock('@/components/posts/MobileShortCard', () => ({ MobileShortCard: ({ post, isActive }: { post: { id: string }; isActive: boolean }) => <div data-testid="clip" data-active={isActive}>{post.id}</div> }));
import ClipsViewer from './ClipsViewer';
const checked = { id: 'one', type: 'short', mediaUrl: 'https://example.test/clip.mp4', mediaUrls: [], thumbnailUrl: null, caption: 'Current clip', tags: [], createdAt: '2026-10-04T12:00:00.000Z', isPinned: false, ageRating: 'safe', viewCount: 0, likeCount: 0, commentCount: 0, author: { id: 'bob', username: 'bob', avatarUrl: null } };
function mount() {
  const client = new QueryClient();
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/clips/one']}><Routes><Route path="/clips/:postId" element={<ClipsViewer />} /><Route path="/watch/:id" element={<p>Long video player</p>} /><Route path="/p/:id" element={<p>Post detail</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}
let observeClip: (target: Element) => void;
beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) {
      observeClip = target => callback([{ target, isIntersecting: true, intersectionRatio: 0.8 } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe() {} disconnect() {} unobserve() {}
  });
  vi.clearAllMocks(); state.mobile = false; state.entry = { status: 'unavailable', expires: 0 };
  state.feed.mockReturnValue({ data: { pages: [{ posts: [{ id: 'stale', type: 'short', media_url: 'https://example.test/stale.mp4' }] }] }, isError: false });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe('checked clip deep links', () => {
  it('does not reveal a feed fallback or issue raw post reads when the selected clip is denied', () => {
    mount(); expect(screen.getByText('This clip is unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('clip')).toBeNull(); expect(state.from).not.toHaveBeenCalled();
    expect(state.feed).toHaveBeenCalledWith('short', false, 'personalized');
  });
  it('offers retry after a failed checked read', () => {
    state.entry.status = 'error'; mount();
    fireEvent.click(screen.getByRole('button', { name: /try again/i })); expect(state.retry).toHaveBeenCalledOnce();
  });
  it('shows a named loading state without rendering media', () => {
    state.entry.status = 'loading'; mount();
    expect(screen.getByRole('status')).toHaveTextContent('Opening your clip'); expect(screen.queryByTestId('clip')).toBeNull();
  });
  it('starts with the selected checked clip and deduplicates recommendations', () => {
    state.entry = { status: 'ready', expires: 30000, post: checked };
    state.feed.mockReturnValue({ data: { pages: [{ posts: [{ id: 'one', type: 'short', media_url: checked.mediaUrl }, { id: 'two', type: 'short', media_url: checked.mediaUrl }, { id: 'text', type: 'post', media_url: checked.mediaUrl }] }] } });
    mount(); expect(screen.getAllByTestId('clip').map(node => node.textContent)).toEqual(['one', 'two']);
    expect(state.feed).toHaveBeenCalledWith('short', true, 'personalized');
  });
  it.each([false, true])('bounds rendered cards while keeping every scroll destination (mobile=%s)', mobile => {
    state.mobile = mobile;
    state.entry = { status: 'ready', expires: 30000, post: checked };
    state.feed.mockReturnValue({ data: { pages: [{ posts: Array.from({ length: 39 }, (_, i) => ({ id: `clip-${i + 1}`, type: 'short', media_url: checked.mediaUrl })) }] } });
    const view = mount();
    const slots = [...view.container.querySelectorAll('.snap-always')];
    expect(slots).toHaveLength(40);
    expect(screen.getAllByTestId('clip').map(node => node.textContent)).toEqual(['one', 'clip-1', 'clip-2']);
    act(() => observeClip(slots[15]));
    expect(screen.getAllByTestId('clip').map(node => node.textContent)).toEqual(['clip-13', 'clip-14', 'clip-15', 'clip-16', 'clip-17']);
    expect(view.container.querySelector('[data-active="true"]')).toHaveTextContent('clip-15');
    expect([...view.container.querySelectorAll('.snap-always')]).toEqual(slots);
    if (!mobile) {
      const scroll = vi.fn();
      Object.defineProperty(slots[16], 'scrollIntoView', { configurable: true, value: scroll });
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    }
    act(() => observeClip(slots[0]));
    expect(screen.getAllByTestId('clip').map(node => node.textContent)).toEqual(['one', 'clip-1', 'clip-2']);
    expect(view.container.querySelector('[data-active="true"]')).toHaveTextContent('one');
  });
  it.each([['video', 'Long video player'], ['post', 'Post detail']])('preserves navigation for an admitted %s', (type, destination) => {
    state.entry = { status: 'ready', expires: 30000, post: { ...checked, type } }; mount();
    expect(screen.getByText(destination)).toBeInTheDocument(); expect(screen.queryByTestId('clip')).toBeNull();
  });
});
