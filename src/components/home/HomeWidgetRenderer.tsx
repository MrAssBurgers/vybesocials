import { memo, type ReactNode, useRef, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Globe, Dna, Wallet, ShoppingBag, Radio, MapPin, PenSquare } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedRewardCard } from '@/components/home/FeedRewardCard';
import { CaughtUpScreen } from '@/components/home/CaughtUpScreen';
import { PostNudgeWidget } from '@/components/home/PostNudgeWidget';
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
import { CreatorAnalytics } from '@/components/analytics/CreatorAnalytics';
import { BattlePassWidget } from '@/components/gamification/BattlePassWidget';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

const FeedAdCard = lazy(() => import('@/components/ads/FeedAdCard').then(m => ({ default: m.FeedAdCard })));
const MemoizedPostCard = memo(PostCard);

import { ImmersiveToggle, ImmersiveFeedMode } from '@/components/home/ImmersiveFeedMode';

/* ── Lazy-mount wrapper using IntersectionObserver ── */
function LazyWidget({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref}>{visible ? children : <div className="h-24" />}</div>;
}

/* ── "Post your first VYBE" CTA for new users ── */
function FirstPostCTA() {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-primary/10 via-accent/5 to-primary/10 border border-primary/20 p-5 text-center"
    >
      <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-3">
        <PenSquare className="h-5 w-5 text-primary" />
      </div>
      <h3 className="text-sm font-bold mb-1">Share your first VYBE ✨</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-[200px] mx-auto">
        Post a photo, video, or thought to get started
      </p>
      <Button
        onClick={() => navigate('/create')}
        className="rounded-full px-6 h-9 text-sm"
      >
        Create Post
      </Button>
    </motion.div>
  );
}

/* ── Widgets that load eagerly (above fold) ── */
const EAGER_WIDGETS = new Set(['greeting', 'ai_brief', 'stories', 'feed']);

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
  localPosts: Post[];
  localLoading: boolean;
  localFetching: boolean;
  isFetchingNextLocal: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
}

/* ── Quick Access Card - adapts size to grid span ── */
function QuickAccessCard({ icon, label, path, gradient, iconColor, widgetId }: {
  icon: ReactNode; label: string; path: string; gradient: string; iconColor: string; widgetId?: string;
}) {
  const navigate = useNavigate();
  const { isEditing, localWidgets } = useEditMode();
  const { config } = useGridLayout();
  const widgets = isEditing ? localWidgets : config.widgets;
  const w = widgetId ? widgets.find(wi => wi.id === widgetId) : null;
  const col = w?.colSpan ?? 1;
  const row = w?.rowSpan ?? 1;
  const isWide = col === 2;
  const isTall = row === 2;

  return (
    <button
      onClick={() => { if (!isEditing) { triggerHaptic('light'); navigate(path); } }}
      className={cn(
        "flex items-center transition-all h-full w-full min-h-0",
        "bg-gradient-to-br border border-white/[0.08] shadow-sm",
        "hover:scale-[1.03] active:scale-[0.97]",
        gradient,
        isWide
          ? 'flex-row gap-3 px-4 py-3 rounded-2xl justify-start'
          : 'flex-col justify-center gap-1 py-2 rounded-xl',
        isTall && !isWide && 'gap-2.5 py-4',
        isTall && isWide && 'py-5',
      )}
    >
      <div className={cn(
        "rounded-md flex items-center justify-center shadow-inner shrink-0",
        iconColor,
        isWide || isTall ? 'w-9 h-9 rounded-lg' : 'w-6 h-6',
      )}>
        {icon}
      </div>
      <span className={cn(
        "font-semibold text-foreground/90 tracking-wide leading-tight",
        isWide ? 'text-sm' : 'text-[9px]',
        isTall && !isWide && 'text-xs',
      )}>{label}</span>
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
          widgetId="vybe_dna"
          icon={<Dna className="h-3.5 w-3.5 text-white" />}
          label="VYBE DNA"
          path="/vybe-dna"
          gradient="from-violet-500/20 via-fuchsia-500/15 to-purple-600/20"
          iconColor="bg-gradient-to-br from-violet-500 to-fuchsia-500"
        />
      );
    case 'wallet':
      return (
        <QuickAccessCard
          widgetId="wallet"
          icon={<Wallet className="h-3.5 w-3.5 text-white" />}
          label="Wallet"
          path="/wallet"
          gradient="from-amber-500/20 via-orange-500/15 to-yellow-500/20"
          iconColor="bg-gradient-to-br from-amber-500 to-orange-500"
        />
      );
    case 'shop':
      return (
        <QuickAccessCard
          widgetId="shop"
          icon={<ShoppingBag className="h-3.5 w-3.5 text-white" />}
          label="Shop"
          path="/marketplace"
          gradient="from-emerald-500/20 via-teal-500/15 to-green-500/20"
          iconColor="bg-gradient-to-br from-emerald-500 to-teal-500"
        />
      );
    case 'communities':
      return (
        <QuickAccessCard
          widgetId="communities"
          icon={<Radio className="h-3.5 w-3.5 text-white" />}
          label="Communities"
          path="/community"
          gradient="from-blue-500/20 via-cyan-500/15 to-sky-500/20"
          iconColor="bg-gradient-to-br from-blue-500 to-cyan-500"
        />
      );
    case 'creator_analytics':
      return <CreatorAnalytics />;
    case 'battle_pass':
      return <BattlePassWidget />;
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
  globalPosts, globalLoading, globalFetching, isFetchingNextGlobal,
  localPosts, localLoading, localFetching, isFetchingNextLocal,
  loadMoreRef,
}: Props) {
  const [immersive, setImmersive] = useState(false);

  return (
    <div className="pb-6" data-tutorial="feed-area">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center gap-2 mb-5">
          <TabsList className="relative flex-1 h-12 p-1 bg-card/60 backdrop-blur-xl rounded-2xl border border-border/20 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.05)]">
            {['foryou', 'local', 'global'].map((tab) => {
              const isActive = activeTab === tab;
              const icons: Record<string, typeof Sparkles> = { foryou: Sparkles, local: MapPin, global: Globe };
              const labels: Record<string, string> = { foryou: 'For You', local: 'Local', global: 'Global' };
              const Icon = icons[tab];
              return (
                <TabsTrigger
                  key={tab}
                  value={tab}
                  className={cn(
                    "relative flex-1 rounded-xl transition-all duration-300 z-10 h-full",
                    isActive
                      ? "text-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground/70"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="feed-tab-capsule"
                      className="absolute inset-0.5 rounded-xl bg-gradient-to-r from-primary/15 via-primary/10 to-accent/15 border border-primary/20 shadow-[0_0_12px_hsl(var(--primary)/0.15),inset_0_1px_0_hsl(var(--foreground)/0.05)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5">
                    <Icon className={cn("h-3.5 w-3.5", isActive && "text-primary")} />
                    {labels[tab]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
          <ImmersiveToggle isImmersive={immersive} onToggle={() => setImmersive(!immersive)} />
        </div>

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
          {/* First post CTA for users with no posts in feed */}
          {!forYouLoading && forYouPosts.length === 0 && (
            <FirstPostCTA />
          )}
          {immersive && forYouPosts.length > 0 ? (
            <ImmersiveFeedMode posts={forYouPosts} loadMoreRef={activeTab === 'foryou' ? loadMoreRef : () => {}} />
          ) : (
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
          )}
        </TabsContent>

        <TabsContent value="local" className="space-y-4" forceMount style={{ display: activeTab === 'local' ? 'block' : 'none' }}>
          <InlinePostList
            posts={localPosts}
            isLoading={localLoading}
            isFetchingNext={isFetchingNextLocal}
            loadMoreRef={activeTab === 'local' ? loadMoreRef : () => {}}
            emptyIcon="📍"
            emptyText="No local posts yet. Share what's happening nearby!"
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

  // Variable reward injection positions (every 8-15 posts)
  const rewardPositions = useMemo(() => {
    if (posts.length < 8) return new Set<number>();
    const positions = new Set<number>();
    let next = 7 + Math.floor(Math.random() * 8); // First at 8-15
    let rewardIdx = 0;
    while (next < posts.length) {
      positions.add(next);
      rewardIdx++;
      next += 8 + Math.floor(Math.random() * 8);
    }
    return positions;
  }, [posts.length]);

  if (isLoading && posts.length === 0) return <PostSkeletonList count={2} />;
  if (!isLoading && posts.length === 0) {
    const iconMap: Record<string, { icon: typeof Sparkles; gradient: string }> = {
      '✨': { icon: Sparkles, gradient: 'from-violet-500/20 to-fuchsia-500/20' },
      '📍': { icon: MapPin, gradient: 'from-orange-500/20 to-amber-500/20' },
      '🌍': { icon: Globe, gradient: 'from-cyan-500/20 to-blue-500/20' },
    };
    const cfg = iconMap[emptyIcon] || iconMap['✨'];
    const EmptyIcon = cfg.icon;
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center py-16 px-4"
      >
        <div className={cn("w-20 h-20 rounded-3xl bg-gradient-to-br flex items-center justify-center mb-5 shadow-lg", cfg.gradient)}>
          <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}>
            <EmptyIcon className="h-8 w-8 text-foreground/70" />
          </motion.div>
        </div>
        <h3 className="text-base font-bold text-foreground mb-1">Nothing here yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-[240px] mb-5">{emptyText}</p>
        {onExplore && (
          <Button onClick={onExplore} className="rounded-full px-6 h-9 text-sm bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-md">
            Explore
          </Button>
        )}
      </motion.div>
    );
  }

  let rewardCount = 0;

  return (
    <>
      {/* Post Nudge — re-engagement */}
      <PostNudgeWidget />

      {posts.map((post, index) => (
        <div key={post.id}>
          <MemoizedPostCard post={post} />
          {adPositions.has(index) && (
            <Suspense fallback={null}><FeedAdCard /></Suspense>
          )}
          {rewardPositions.has(index) && (
            <FeedRewardCard index={rewardCount++} />
          )}
        </div>
      ))}

      {/* Caught Up screen after all posts */}
      {!isFetchingNext && posts.length >= 5 && (
        <CaughtUpScreen />
      )}

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

  // Non-editing: render with lazy-loading for below-fold widgets
  return (
    <WidgetGrid>
      {enabledIds.map(id => {
        const w = widgets.find(wi => wi.id === id);
        const isEager = EAGER_WIDGETS.has(id);
        const content = <WidgetContent id={id} props={props} />;
        
        return (
          <motion.div
            key={id}
            layout
            data-widget-id={id}
            transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            className={cn(
              w?.colSpan === 2 ? 'col-span-2' : 'col-span-1',
              w?.rowSpan === 2 ? 'row-span-2' : 'row-span-1',
            )}
          >
            {isEager ? content : <LazyWidget>{content}</LazyWidget>}
          </motion.div>
        );
      })}
    </WidgetGrid>
  );
}
