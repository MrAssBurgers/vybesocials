import { memo, type ReactNode, useRef, useState, useEffect, useCallback } from 'react';
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
import { scrollAppTo } from '@/lib/appScrollContainer';
import { getAdInterval } from '@/components/ads/FeedAdCard';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { motion } from 'framer-motion';
import { CreatorAnalytics } from '@/components/analytics/CreatorAnalytics';
import { BattlePassWidget } from '@/components/gamification/BattlePassWidget';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { isFullyLoggedIn } from '@/lib/authReady';
import { useAheadMediaPreload } from '@/hooks/useAheadMediaPreload';
import { FEED_PRELOAD_AHEAD } from '@/lib/performanceConfig';
import { useFeedOfflineState } from '@/hooks/useFeedOfflineState';
import {
  FeedOfflineNoCache,
  FeedOfflineCachedBanner,
  FeedRefreshingBanner,
  FriendLinkSpotlight,
  getFriendLinkSpotlightDismissed,
  dismissFriendLinkSpotlight,
} from '@/components/feed/FeedOfflineStates';
import { openFriendLink } from '@/lib/friendLinkUi';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const FeedAdCard = lazy(() => import('@/components/ads/FeedAdCard').then(m => ({ default: m.FeedAdCard })));
const MemoizedPostCard = memo(PostCard);



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
      className="home-first-post-cta mx-2 p-5 text-center rounded-3xl"
    >
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/25 to-accent/20 flex items-center justify-center mx-auto mb-3 ring-1 ring-primary/20">
        <PenSquare className="h-5 w-5 text-primary" />
      </div>
      <h3 className="home-hero-title text-base mb-1">Share your first VYBE</h3>
      <p className="text-xs text-muted-foreground mb-4 max-w-[200px] mx-auto">
        Post a photo, video, or thought to get started
      </p>
      <Button
        onClick={() => navigate('/upload')}
        className="rounded-full px-6 h-9 text-sm"
      >
        Create Post
      </Button>
    </motion.div>
  );
}

/* ── Widgets that load eagerly (above fold) ── */
const EAGER_WIDGETS = new Set(['greeting', 'ai_brief', 'stories', 'xp_streak', 'feed']);
const RENDERABLE_WIDGETS = new Set([
  'greeting',
  'xp_streak',
  'ai_brief',
  'stories',
  'weekly_rhythm',
  'vybe_dna',
  'wallet',
  'shop',
  'communities',
  'creator_analytics',
  'battle_pass',
  'feed',
]);

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
  forYouRefreshing?: boolean;
  forYouError?: boolean;
  onRetryForYou?: () => void;
  forYouFetching: boolean;
  isFetchingNextForYou: boolean;
  globalPosts: Post[];
  globalLoading: boolean;
  globalRefreshing?: boolean;
  globalError?: boolean;
  onRetryGlobal?: () => void;
  globalFetching: boolean;
  isFetchingNextGlobal: boolean;
  localPosts: Post[];
  localLoading: boolean;
  localRefreshing?: boolean;
  localError?: boolean;
  onRetryLocal?: () => void;
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
        "flex items-center transition-all h-full w-full min-h-0 home-quick-card bg-gradient-to-br",
        "hover:scale-[1.02] active:scale-[0.98]",
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
  const { isEditing, localWidgets } = useEditMode();
  const { config } = useGridLayout();
  const widgets = isEditing ? localWidgets : config.widgets;
  const widget = widgets.find((w) => w.id === id);
  const colSpan = widget?.colSpan ?? 2;
  const rowSpan = widget?.rowSpan ?? 1;

  switch (id) {
    case 'greeting':
      return <GreetingWidget />;
    case 'xp_streak':
      return <XPStreakWidget />;
    case 'ai_brief':
      return <DailyBriefWidget />;
    case 'stories':
      return (
        <ErrorBoundary scope="home:stories" fallback={() => null}>
          <StoriesBar colSpan={colSpan} rowSpan={1} />
        </ErrorBoundary>
      );
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
      return (
        <ErrorBoundary scope="home:battle-pass" fallback={() => null}>
          <BattlePassWidget />
        </ErrorBoundary>
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
  forYouPosts, forYouLoading, forYouRefreshing, forYouError, onRetryForYou, forYouFetching, isFetchingNextForYou,
  globalPosts, globalLoading, globalRefreshing, globalError, onRetryGlobal, globalFetching, isFetchingNextGlobal,
  localPosts, localLoading, localRefreshing, localError, onRetryLocal, localFetching, isFetchingNextLocal,
  loadMoreRef,
}: Props) {
  const { user, profile, loading: authLoading } = useAuth();
  const loggedIn = isFullyLoggedIn(user, profile, authLoading);
  const [showFriendLinkSpotlight, setShowFriendLinkSpotlight] = useState(
    () => !getFriendLinkSpotlightDismissed(),
  );

  return (
    <div className="pb-6 px-1" data-tutorial="feed-area">
      {loggedIn && showFriendLinkSpotlight && activeTab === 'foryou' && (
        <FriendLinkSpotlight
          onOpen={() => openFriendLink('tap')}
          onDismiss={() => {
            dismissFriendLinkSpotlight();
            setShowFriendLinkSpotlight(false);
          }}
        />
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex items-center gap-2 mb-4 px-2">
          <TabsList data-no-auto-contrast className="home-feed-tabs relative flex-1 h-11 p-1 rounded-2xl">
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
                    'relative flex-1 rounded-xl transition-colors duration-200 z-10 h-full text-xs font-semibold',
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="home-feed-tab-pill"
                      className="absolute inset-0.5 rounded-xl home-feed-tab-active"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center justify-center gap-1.5">
                    <Icon className={cn('h-3.5 w-3.5', isActive && 'drop-shadow-sm')} />
                    {labels[tab]}
                  </span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        {hasNewPosts && (
          <button
            type="button"
            onClick={() => { clearNewPosts(); handleRefresh(); scrollAppTo(0, 'smooth'); }}
            className="home-new-posts-btn w-full mb-4 py-2.5 px-4 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
          >
            <Sparkles className="h-4 w-4" />
            New posts — tap to refresh
          </button>
        )}

        <TabsContent value="foryou" className="space-y-4" forceMount style={{ display: activeTab === 'foryou' ? 'block' : 'none' }}>
          {!forYouLoading && forYouPosts.length === 0 && (
            <FirstPostCTA />
          )}
          <InlinePostList
            posts={forYouPosts}
            isLoading={forYouLoading}
            isRefreshing={forYouRefreshing}
            isError={forYouError}
            onRetry={onRetryForYou}
            isFetchingNext={isFetchingNextForYou}
            loadMoreRef={activeTab === 'foryou' ? loadMoreRef : () => {}}
            emptyIcon="✨"
            emptyText="No posts yet. Follow creators or check Global!"
            onExplore={() => navigate('/explore')}
            showAds={showAds}
          />
        </TabsContent>

        <TabsContent value="local" className="space-y-4" forceMount style={{ display: activeTab === 'local' ? 'block' : 'none' }}>
          <InlinePostList
            posts={localPosts}
            isLoading={localLoading}
            isRefreshing={localRefreshing}
            isError={localError}
            onRetry={onRetryLocal}
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
            isRefreshing={globalRefreshing}
            isError={globalError}
            onRetry={onRetryGlobal}
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
  posts, isLoading, isRefreshing, isError, onRetry, isFetchingNext, loadMoreRef, emptyIcon, emptyText, onExplore, showAds,
}: {
  posts: Post[];
  isLoading: boolean;
  isRefreshing?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isFetchingNext: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
  emptyIcon: string;
  emptyText: string;
  onExplore?: () => void;
  showAds: boolean;
}) {
  const { data: dnaPrefs } = useDNAPreferences();
  const adPositions = useMemo(() => {
    if (!showAds || posts.length === 0) return new Set<number>();
    const positions = new Set<number>();
    let adIndex = 0;
    let next = getAdInterval(adIndex, dnaPrefs) - 1;
    while (next < posts.length) {
      positions.add(next);
      adIndex++;
      next += getAdInterval(adIndex, dnaPrefs);
    }
    return positions;
  }, [showAds, posts.length, dnaPrefs]);

  // Variable reward injection positions (every 8-15 posts).
  // Positions are generated once and only extended as the feed grows —
  // regenerating with fresh randomness made reward cards jump on pagination.
  const rewardStateRef = useRef({ positions: new Set<number>(), next: 7 + Math.floor(Math.random() * 8) });
  const rewardPositions = useMemo(() => {
    const state = rewardStateRef.current;
    while (state.next < posts.length) {
      state.positions.add(state.next);
      state.next += 8 + Math.floor(Math.random() * 8);
    }
    return new Set(state.positions);
  }, [posts.length]);

  // Track which post is currently in view so we can preload the next 3 ahead
  const [visibleIndex, setVisibleIndex] = useState(0);
  const visibleIndexRef = useRef(0);
  const visibilityRafRef = useRef<number | null>(null);
  const visibilityObserverRef = useRef<IntersectionObserver | null>(null);
  const postRefMap = useRef<Map<number, HTMLElement>>(new Map());

  useEffect(() => {
    visibleIndexRef.current = visibleIndex;
  }, [visibleIndex]);

  useEffect(() => {
    visibilityObserverRef.current?.disconnect();
    if (posts.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;
        entries.forEach((entry) => {
          if (entry.intersectionRatio < 0.3) return;
          const idxAttr = (entry.target as HTMLElement).dataset.postIndex;
          if (!idxAttr) return;
          const idx = Number(idxAttr);
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        });
        if (!best || best.idx === visibleIndexRef.current) return;
        visibleIndexRef.current = best.idx;
        if (visibilityRafRef.current !== null) {
          cancelAnimationFrame(visibilityRafRef.current);
        }
        visibilityRafRef.current = requestAnimationFrame(() => {
          visibilityRafRef.current = null;
          setVisibleIndex(best!.idx);
        });
      },
      { threshold: [0.3, 0.6] },
    );

    visibilityObserverRef.current = observer;
    postRefMap.current.forEach((el) => observer.observe(el));
    return () => {
      observer.disconnect();
      if (visibilityRafRef.current !== null) {
        cancelAnimationFrame(visibilityRafRef.current);
        visibilityRafRef.current = null;
      }
    };
  }, [posts.length]);

  const registerPostRef = useCallback((index: number) => (el: HTMLElement | null) => {
    if (el) {
      el.dataset.postIndex = String(index);
      postRefMap.current.set(index, el);
      visibilityObserverRef.current?.observe(el);
    } else {
      postRefMap.current.delete(index);
    }
  }, []);

  // Aggressively warm next N posts (images decoded, video first-frame ready)
  useAheadMediaPreload(posts as any, visibleIndex, FEED_PRELOAD_AHEAD);

  const { isOfflineNoCache, showCachedBanner } = useFeedOfflineState(posts.length);

  if (!isLoading && isOfflineNoCache) {
    return <FeedOfflineNoCache onRetry={onRetry} />;
  }
  if (isLoading && posts.length === 0 && !isFetchingNext) return <PostSkeletonList count={2} />;
  if (isError && posts.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/40 p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Couldn&apos;t load your feed.</p>
        {onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    );
  }
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

  // Attach the load-more sentinel 5 posts BEFORE the end so the next page
  // is fetched while the user is still scrolling through current content.
  const earlyTriggerIndex = Math.max(0, posts.length - 5);

  let rewardCount = 0;

  return (
    <>
      {isRefreshing && <FeedRefreshingBanner />}
      {showCachedBanner && <FeedOfflineCachedBanner />}
      {/* Post Nudge — re-engagement */}
      <PostNudgeWidget />

      {posts.map((post, index) => (
        <div
          key={post.id}
          data-post-card
          ref={registerPostRef(index)}
        >
          <ErrorBoundary
            scope={`feed-post:${post.id}`}
            fallback={() => (
              <div className="rounded-2xl border border-border/30 bg-card/40 p-4 my-2 text-center text-sm text-muted-foreground">
                Couldn&apos;t load this post.
              </div>
            )}
          >
            <MemoizedPostCard post={post} eager={index < 2} />
          </ErrorBoundary>
          {/* Early load-more sentinel — fires 5 posts before the end */}
          {index === earlyTriggerIndex && (
            <div ref={loadMoreRef} aria-hidden className="h-px w-full" />
          )}
          {adPositions.has(index) && (
            <ErrorBoundary scope={`feed-ad:${index}`} fallback={() => null}>
              <Suspense fallback={null}><FeedAdCard /></Suspense>
            </ErrorBoundary>
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

      <div className="h-10 flex items-center justify-center">
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
    ? orderedEnabledIds.filter(id => RENDERABLE_WIDGETS.has(id))
    : widgets.filter(w => w.enabled && RENDERABLE_WIDGETS.has(w.id)).sort((a, b) => a.order - b.order).map(w => w.id);

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
              w?.rowSpan === 2 && id !== 'stories' ? 'row-span-2' : 'row-span-1',
              id === 'stories' && 'h-fit self-start',
            )}
          >
            {isEager ? content : <LazyWidget>{content}</LazyWidget>}
          </motion.div>
        );
      })}
    </WidgetGrid>
  );
}
