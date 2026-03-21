import { memo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Globe, Dna, Wallet, ShoppingBag, Radio } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { WeeklyRhythmBanner } from '@/components/home/WeeklyRhythmBanner';
import { GreetingWidget } from '@/components/home/GreetingWidget';
import { XPStreakWidget } from '@/components/home/XPStreakWidget';
import { DailyBriefWidget } from '@/components/home/DailyBriefWidget';
import { EditableWidgetWrapper, EditableWidgetList, WidgetGrid, useEditMode } from '@/components/home/HomeEditMode';
import { useGridLayout } from '@/hooks/useGridLayout';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import type { Post } from '@/hooks/useInfinitePosts';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useMemo } from 'react';
import { useShowAds } from '@/hooks/useShowAds';
import { getAdInterval } from '@/components/ads/FeedAdCard';
import { motion } from 'framer-motion';

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

/* ── Quick Access Card - compact, auto-scaling ── */
function QuickAccessCard({ icon, label, path, gradient, iconColor }: {
  icon: ReactNode; label: string; path: string; gradient: string; iconColor: string;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => { triggerHaptic('light'); navigate(path); }}
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 py-3 rounded-2xl transition-all h-full w-full min-h-0",
        "bg-gradient-to-br border border-white/[0.08] shadow-sm",
        "hover:scale-[1.03] active:scale-[0.97]",
        gradient,
      )}
    >
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-inner", iconColor)}>
        {icon}
      </div>
      <span className="text-[10px] font-semibold text-foreground/90 tracking-wide leading-tight">{label}</span>
    </button>
  );
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
    case 'vybe_dna':
      return (
        <QuickAccessCard
          icon={<Dna className="h-4 w-4 text-white" />}
          label="VYBE DNA"
          path="/vybe-dna"
          gradient="from-violet-500/20 via-fuchsia-500/15 to-purple-600/20"
          iconColor="bg-gradient-to-br from-violet-500 to-fuchsia-500"
        />
      );
    case 'wallet':
      return (
        <QuickAccessCard
          icon={<Wallet className="h-4 w-4 text-white" />}
          label="Wallet"
          path="/wallet"
          gradient="from-amber-500/20 via-orange-500/15 to-yellow-500/20"
          iconColor="bg-gradient-to-br from-amber-500 to-orange-500"
        />
      );
    case 'shop':
      return (
        <QuickAccessCard
          icon={<ShoppingBag className="h-4 w-4 text-white" />}
          label="Shop"
          path="/marketplace"
          gradient="from-emerald-500/20 via-teal-500/15 to-green-500/20"
          iconColor="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
      );
    case 'communities':
      return (
        <QuickAccessCard
          icon={<Radio className="h-4 w-4 text-white" />}
          label="Communities"
          path="/community"
          gradient="from-blue-500/20 via-cyan-500/15 to-sky-500/20"
          iconColor="bg-gradient-to-br from-blue-500 to-cyan-500"
        />
      );
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
    <div className="pb-6" data-tutorial="feed-area">
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

/* ── Main renderer: 2D grid with Samsung-style drag ── */
export function HomeWidgetRenderer(props: Props) {
  const { isEditing, localWidgets, orderedEnabledIds } = useEditMode();
  const { config } = useGridLayout();

  const widgets = isEditing ? localWidgets : config.widgets;
  const enabledIds = isEditing
    ? orderedEnabledIds
    : widgets.filter(w => w.enabled).sort((a, b) => a.order - b.order).map(w => w.id);

  if (isEditing) {
    return (
      <EditableWidgetList>
        {enabledIds.map(id => (
          <EditableWidgetWrapper key={id} widgetId={id}>
            <div data-widget-id={id}>
              <WidgetContent id={id} props={props} />
            </div>
          </EditableWidgetWrapper>
        ))}
      </EditableWidgetList>
    );
  }

  // Non-editing: render with smooth layout animations
  return (
    <WidgetGrid>
      {enabledIds.map(id => {
        const w = widgets.find(wi => wi.id === id);
        return (
          <motion.div
            key={id}
            layout
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={cn(
              w?.colSpan === 2 ? 'col-span-2' : 'col-span-1',
              w?.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
            )}
          >
            <WidgetContent id={id} props={props} />
          </motion.div>
        );
      })}
    </WidgetGrid>
  );
}
