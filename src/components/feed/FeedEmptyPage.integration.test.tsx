import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Post } from '@/hooks/useInfinitePosts';

const state = vi.hoisted(() => ({ next: vi.fn(), retry: vi.fn(), window: vi.fn(), hasWindow: false, hasNext: true, fetching: false, error: false, pages: [] as { posts: Post[] }[] }));
const query = () => ({ data: { pages: state.pages }, hasNextPage: state.hasNext,
  isFetchingNextPage: state.fetching, isLoading: false, isError: state.error, isFetching: state.fetching,
  fetchNextPage: state.next, refetch: state.retry, hasMoreWindow: state.hasWindow, advanceWindow: state.window });
vi.mock('@/lib/appScrollContainer', () => ({ scrollAppTo: vi.fn() }));
vi.mock('@/hooks/useRankedFeed', () => ({ useRankedFeed: () => query() }));
vi.mock('@/hooks/useInfinitePosts', () => ({ usePersonalizedFeed: () => query(), useInfiniteFollowingPosts: () => query() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useParams: () => ({ postId: 'selected' }), useLocation: () => ({}) }));
vi.mock('@tanstack/react-query', () => ({ useInfiniteQuery: () => query(), useQuery: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => ({ ready: false, session: { uid: 'alice', epoch: 1 } }) }));
vi.mock('@/hooks/useSocialFeed', () => ({ useSocialFeed: () => query() }));
vi.mock('@/components/chat/SharedPostPreviews', () => ({
  SharedPostPreviewProvider: ({ children }: PropsWithChildren) => <>{children}</>,
  useActivePostPreview: () => ({ entry: { status: 'ready', expires: 30000, post: {
    id: 'selected', type: 'short', mediaUrl: 'https://example.test/selected.mp4', thumbnailUrl: null,
    caption: '', tags: [], createdAt: '2026-10-04T12:00:00.000Z', isPinned: false,
    viewCount: 0, likeCount: 0, commentCount: 0,
    author: { id: 'selected-author', username: 'selected', avatarUrl: null },
  } }, retry: state.retry }),
}));
vi.mock('@/hooks/useFeedMuteFilter', () => ({ useFeedMuteFilter: (value: unknown) => value }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/postReactions', () => ({ getViewerPostReaction: vi.fn() }));
vi.mock('@/lib/signedUrlCache', () => ({ ensureMediaUrlsReady: vi.fn() }));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: true }) }));
vi.mock('@/components/layout/AppLayout', () => ({ AppLayout: ({ children }: PropsWithChildren) => <>{children}</> }));
vi.mock('@/components/explore/VideoCard', () => ({ VideoCard: () => null }));
vi.mock('@/components/posts/PostCard', () => ({ PostCard: () => null }));
vi.mock('@/components/posts/ShortCard', () => ({ ShortCard: ({ post }: { post: Post }) => <p>Clip {post.id}</p> }));
vi.mock('@/components/posts/MobileShortCard', () => ({ MobileShortCard: () => null }));
vi.mock('@/components/clips/ClipSkeleton', () => ({ ClipSkeleton: () => null }));
vi.mock('@/components/clips/ClipsFeedHeader', () => ({ ClipsFeedHeader: () => null }));
vi.mock('@/hooks/useVideoPreload', () => ({ useVideoPreload: () => undefined }));
vi.mock('@/hooks/useNetworkStatus', () => ({ useNetworkStatus: () => ({ isSlowConnection: false }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobileOrTablet: () => ({ isMobileOrTablet: false }) }));
vi.mock('@/hooks/useVideoAds', () => ({ useVideoAds: () => ({ showVideoAd: vi.fn(), isMidFeedAdSlot: () => false }) }));
vi.mock('@/components/home/FeedRewardCard', () => ({ FeedRewardCard: () => null }));
vi.mock('@/components/home/CaughtUpScreen', () => ({ CaughtUpScreen: () => <p>Caught up</p> }));
vi.mock('@/components/home/PostNudgeWidget', () => ({ PostNudgeWidget: () => null }));
vi.mock('@/components/stories/StoriesBar', () => ({ StoriesBar: () => null }));
vi.mock('@/components/home/WeeklyRhythmBanner', () => ({ WeeklyRhythmBanner: () => null }));
vi.mock('@/components/home/GreetingWidget', () => ({ GreetingWidget: () => null }));
vi.mock('@/components/home/XPStreakWidget', () => ({ XPStreakWidget: () => null }));
vi.mock('@/components/home/DailyBriefWidget', () => ({ DailyBriefWidget: () => null }));
vi.mock('@/components/home/HomeEditMode', () => ({}));
vi.mock('@/hooks/useGridLayout', () => ({}));
vi.mock('@/hooks/useShowAds', () => ({}));
vi.mock('@/hooks/useDNAPreferences', () => ({ useDNAPreferences: () => ({ data: null }) }));
vi.mock('@/components/analytics/CreatorAnalytics', () => ({ CreatorAnalytics: () => null }));
vi.mock('@/components/gamification/BattlePassWidget', () => ({ BattlePassWidget: () => null }));
vi.mock('@/components/ads/FeedAdCard', () => ({ getAdInterval: () => 10 }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({}) }));
vi.mock('@/hooks/useAheadMediaPreload', () => ({ useAheadMediaPreload: () => undefined }));
vi.mock('@/hooks/useVirtualScrollSlice', () => ({ useVirtualScrollSlice: () => ({ visible: [], visibleStart: 0, paddingTop: 0, paddingBottom: 0, virtualized: false }) }));
vi.mock('@/hooks/useFeedOfflineState', () => ({ useFeedOfflineState: () => ({ isOfflineNoCache: false, showCachedBanner: false }) }));
vi.mock('@/components/feed/FeedOfflineStates', () => ({}));
vi.mock('@/lib/friendLinkUi', () => ({}));

import { InlinePostList } from '@/components/home/HomeWidgetRenderer';
import { ClipsLongVideosPanel } from '@/components/clips/ClipsLongVideosPanel';
import VideoBrowse from '@/pages/VideoBrowse';
import Shorts from '@/pages/Shorts';
import ClipsViewer from '@/pages/ClipsViewer';
import { FeedWindowControl } from './FeedWindowControl';

beforeEach(() => { localStorage.clear(); state.pages = [{ posts: [] }]; state.next.mockReset(); state.retry.mockReset(); state.window.mockReset().mockResolvedValue(undefined); state.hasWindow = false; state.hasNext = true; state.fetching = false; state.error = false;
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo'); });
function HomeEmpty() { return <InlinePostList posts={state.pages.flatMap(page => page.posts)} isLoading={false} isFetchingNext={state.fetching} hasNextPage={state.hasNext}
  onLoadMore={state.next} windowControls={state.hasWindow ? <FeedWindowControl onContinue={state.window} /> : undefined} loadMoreRef={vi.fn()} emptyIcon="✨" emptyText="No posts" showAds={false} emptyOverride={<p>Find your friends</p>} />; }

describe('empty filtered pages keep their raw cursor reachable', () => {
  it.each([['Home', HomeEmpty], ['Watch', VideoBrowse]] as const)('%s makes a full window transition explicit without reporting an empty catalog', (_name, Component) => {
    state.hasNext = false; state.hasWindow = true; render(<Component />);
    expect(state.next).not.toHaveBeenCalled(); expect(state.window).not.toHaveBeenCalled();
    expect(screen.queryByText('Find your friends')).not.toBeInTheDocument(); expect(screen.queryByText('No videos yet')).not.toBeInTheDocument(); expect(screen.queryByText('Caught up')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue to older posts' })); expect(state.window).toHaveBeenCalledOnce();
  });
  it('keeps rendered Home posts until the user chooses to replace the full window', () => {
    state.pages = [{ posts: Array.from({ length: 5 }, (_, i) => ({ id: `visible-${i}`, type: 'post', media_url: '', author: { id: 'alice' } } as Post)) }]; state.hasWindow = true; state.hasNext = false; render(<HomeEmpty />);
    expect(screen.queryByText('Caught up')).not.toBeInTheDocument(); expect(state.window).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Continue to older posts' })); expect(state.window).toHaveBeenCalledOnce();
  });
  it.each([['Home', HomeEmpty], ['Watch', VideoBrowse], ['long videos', ClipsLongVideosPanel], ['Clips', Shorts], ['opened clip', ClipsViewer]] as const)('%s continues only after an explicit request', (_name, Component) => {
    const page = render(<Component />);
    expect(state.next).not.toHaveBeenCalled();
    expect(screen.queryByText('Find your friends')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' })); expect(state.next).toHaveBeenCalledTimes(1);
    // Changing the fixture key also refreshes the memoized long-video panel;
    // real query observers notify it directly when their result changes.
    state.fetching = true; page.rerender(<Component key="fetching" />);
    expect(screen.getByRole('button', { name: 'Loading more…' })).toBeDisabled();
    state.fetching = false; state.hasNext = false; page.rerender(<Component key="exhausted" />);
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(state.next).toHaveBeenCalledTimes(1);
  });
  it('keeps the genuine Home empty state once the raw feed is exhausted', () => {
    state.hasNext = false; render(<HomeEmpty />); expect(screen.getByText('Find your friends')).toBeInTheDocument();
  });
  it.each([['Home', HomeEmpty], ['long videos', ClipsLongVideosPanel], ['Clips', Shorts], ['opened clip', ClipsViewer]] as const)('%s stops after a later fully hidden page and offers deliberate continuation', (_name, Component) => {
    state.pages = [{ posts: Array.from({ length: 5 }, (_, index) => ({ id: `visible-${index}`, type: 'short', media_url: '/clip.mp4', author: { id: 'visible-author' } } as Post)) }, { posts: [] }];
    render(<Component />);
    expect(state.next).not.toHaveBeenCalled(); expect(screen.queryByText('Caught up')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load more' })); expect(state.next).toHaveBeenCalledTimes(1);
  });
  it.each([['long videos', ClipsLongVideosPanel], ['Clips', Shorts], ['opened clip', ClipsViewer]] as const)('%s does not automatically repeat a failed next page', (_name, Component) => {
    state.pages = [{ posts: [{ id: 'visible', type: 'short', media_url: '/clip.mp4', author: { id: 'visible-author' } } as Post] }]; state.error = true;
    render(<Component />); expect(state.next).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.retry).toHaveBeenCalledTimes(1);
  });
  it('preserves the explicitly opened clip when saved mute preferences cannot be loaded', () => {
    state.error = true; render(<ClipsViewer />);
    expect(screen.getByText('Clip selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Manage feed mutes in Settings' })).toBeInTheDocument();
    expect(state.next).not.toHaveBeenCalled();
  });
  it('also stops when the latest recommendation page repeats only already visible clips', () => {
    const post = { id: 'visible', type: 'short', media_url: '/clip.mp4', author: { id: 'visible-author' } } as Post;
    state.pages = [{ posts: [post] }, { posts: [post] }]; render(<ClipsViewer />);
    expect(state.next).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Load more' })).toBeEnabled();
  });
  it('does not disguise an unavailable mute list as an empty Watch catalog', () => {
    state.error = true; render(<VideoBrowse />);
    expect(screen.queryByText('No videos yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' })); expect(state.retry).toHaveBeenCalledTimes(1);
  });
});
