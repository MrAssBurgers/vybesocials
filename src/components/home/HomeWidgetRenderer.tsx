import { memo, type ReactNode } from 'react';
import { Sparkles, Globe } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { WeeklyRhythmBanner } from '@/components/home/WeeklyRhythmBanner';
import { DiscoveryCards } from '@/components/home/DiscoveryCards';
import { GreetingWidget } from '@/components/home/GreetingWidget';
import { XPStreakWidget } from '@/components/home/XPStreakWidget';
import { DailyBriefWidget } from '@/components/home/DailyBriefWidget';
import { EditableWidgetWrapper, EditableWidgetList, useEditMode } from '@/components/home/HomeEditMode';
import { useGridLayout } from '@/hooks/useGridLayout';
import type { Post } from '@/hooks/useInfinitePosts';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { useShowAds } from '@/hooks/useShowAds';
import { getAdInterval } from '@/components/ads/FeedAdCard';

const FeedAdCard = lazy(() => import('@/components/ads/FeedAdCard').then(m => ({ default: m.FeedAdCard })));
const MemoizedPostCard = memo(PostCard);

interface Props {
  customizerOpen: boolean;
  activeTab: string;
  setActiveTab: (v: string) => void;
  showAds: boolean;
  navigate: (path: string) => void;
  hasNewPosts: boolean;
  clearNewPosts: () => void;
  handleRefresh: () => Promise<void>;
  forYouPosts: Post[];
  forYouLoading: boolean;
  forYouFetching: boolean;
  isFetchingNextForYou: boolean;
  globalPosts: Post[];
  globalLoading: boolean;
  globalFetching: boolean;
  isFetchingNextGlobal: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
}

/* ── Map widget IDs to actual components ── */
function WidgetContent({ id, props }: { id: string; props: Props }) {
  switch (id) {
    case 'greeting':
      return <GreetingWidget />;
    case 'xp_streak':
      return <XPStreakWidget />;
    case 'ai_brief':
      return <DailyBriefWidget />;
    case 'stories':
      return <StoriesBar />;
    case 'weekly_rhythm':
      return <WeeklyRhythmBanner />;
    case 'discovery':
      return <DiscoveryCards />;
    case 'feed':
      return <FeedSection {...props} />;
    default:
      return null;
  }
}

/* ── Feed section as its own widget ── */
function FeedSection({
  activeTab, setActiveTab, showAds, navigate, hasNewPosts, clearNewPosts, handleRefresh,
  forYouPosts, forYouLoading, forYouFetching, isFetchingNextForYou,
  globalPosts, globalLoading, globalFetching, isFetchingNextGlobal, loadMoreRef,
}: Props) {
  return (
    <div className="px-3 pb-6" data-tutorial="feed-area">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full mb-5 h-11 p-1 bg-muted/50 rounded-xl">
          <TabsTrigger value="foryou" className="flex-1 rounded-lg tab-glow data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Sparkles className="h-4 w-4 mr-1.5" />
            For You
          </TabsTrigger>
          <TabsTrigger value="global" className="flex-1 rounded-lg tab-glow data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Globe className="h-4 w-4 mr-1.5" />
            Global
          </TabsTrigger>
        </TabsList>

        {hasNewPosts && (
          <button
            onClick={() => { clearNewPosts(); handleRefresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="w-full mb-4 py-2.5 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
          >
            <Sparkles className="h-4 w-4" />
            New posts available — tap to see
          </button>
        )}

        <TabsContent value="foryou" className="space-y-4" forceMount style={{ display: activeTab === 'foryou' ? 'block' : 'none' }}>
          <InlinePostList
            posts={forYouPosts}
            isLoading={forYouLoading}
            isFetchingNext={isFetchingNextForYou}
            loadMoreRef={activeTab === 'foryou' ? loadMoreRef : () => {}}
            emptyIcon="✨"
            emptyText="No posts yet. Follow creators or check Global!"
            onExplore={() => navigate('/explore')}
            showAds={showAds}
          />
        </TabsContent>

        <TabsContent value="global" className="space-y-4" forceMount style={{ display: activeTab === 'global' ? 'block' : 'none' }}>
          <InlinePostList
            posts={globalPosts}
            isLoading={globalLoading}
            isFetchingNext={isFetchingNextGlobal}
            loadMoreRef={activeTab === 'global' ? loadMoreRef : () => {}}
            emptyIcon="🌍"
            emptyText="No posts yet. Be the first to share something!"
            onExplore={() => navigate('/explore')}
            showAds={showAds}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InlinePostList({
  posts, isLoading, isFetchingNext, loadMoreRef, emptyIcon, emptyText, onExplore, showAds,
}: {
  posts: Post[];
  isLoading: boolean;
  isFetchingNext: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
  emptyIcon: string;
  emptyText: string;
  onExplore?: () => void;
  showAds: boolean;
}) {
  const adPositions = useMemo(() => {
    if (!showAds || posts.length === 0) return new Set<number>();
    const positions = new Set<number>();
    let adIndex = 0;
    let next = getAdInterval(adIndex) - 1;
    while (next < posts.length) {
      positions.add(next);
      adIndex++;
      next += getAdInterval(adIndex);
    }
    return positions;
  }, [showAds, posts.length]);

  if (isLoading && posts.length === 0) return <PostSkeletonList count={2} />;
  if (!isLoading && posts.length === 0) {
    return <EmptyState emoji={emptyIcon} title="Nothing here yet" description={emptyText} actionLabel={onExplore ? "Explore" : undefined} onAction={onExplore} />;
  }

  return (
    <>
      {posts.map((post, index) => (
        <div key={post.id}>
          <MemoizedPostCard post={post} />
          {adPositions.has(index) && (
            <Suspense fallback={null}><FeedAdCard /></Suspense>
          )}
        </div>
      ))}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isFetchingNext && <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    </>
  );
}

/* ── Main renderer: orders widgets and wraps in editable list ── */
export function HomeWidgetRenderer(props: Props) {
  const { isEditing, localWidgets, orderedEnabledIds } = useEditMode();
  const { config } = useGridLayout();

  // Use local widgets when editing, saved config otherwise
  const widgets = isEditing ? localWidgets : config.widgets;
  const enabledIds = isEditing
    ? orderedEnabledIds
    : widgets.filter(w => w.enabled).sort((a, b) => a.order - b.order).map(w => w.id);

  return (
    <EditableWidgetList>
      {enabledIds.map(id => (
        <EditableWidgetWrapper key={id} widgetId={id}>
          <WidgetContent id={id} props={props} />
        </EditableWidgetWrapper>
      ))}
    </EditableWidgetList>
  );
}
