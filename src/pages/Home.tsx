import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles, LayoutGrid, Eye, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import { useLocalFeed } from '@/hooks/useLocalFeed';
import type { Post } from '@/hooks/useInfinitePosts';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useNewPostsBanner } from '@/hooks/usePostsRealtime';
import { useShowAds } from '@/hooks/useShowAds';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { hasActiveReferral, isInviteEntryMode } from '@/lib/referral';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh';
import { Button } from '@/components/ui/button';
import { GlobalEventBanner } from '@/components/events/GlobalEventBanner';
import { HomeEditModeProvider, useEditMode } from '@/components/home/HomeEditMode';
import { HomeWidgetRenderer } from '@/components/home/HomeWidgetRenderer';
import { useGridLayout } from '@/hooks/useGridLayout';
import SmartErrorBoundary from '@/components/error/SmartErrorBoundary';

// Lazy load heavy components that aren't needed for initial render
const AnnouncementModal = lazy(() => import('@/components/announcements/AnnouncementModal').then(m => ({ default: m.AnnouncementModal })));
const VYBECommandBar = lazy(() => import('@/components/ai/VYBECommandBar').then(m => ({ default: m.VYBECommandBar })));
const WeeklyRecapModal = lazy(() => import('@/components/recap/WeeklyRecapModal').then(m => ({ default: m.WeeklyRecapModal })));

// DNA preference scoring - boost/reduce based on tag matching
function getDNAScore(post: Post, boostSet: Set<string>, reduceSet: Set<string>): number {
  let score = 0;
  const tags = (post.tags || []).map(t => t.toLowerCase());
  const caption = (post.caption || '').toLowerCase();
  for (const tag of tags) {
    if (boostSet.has(tag)) score += 2;
    if (reduceSet.has(tag)) score -= 2;
  }
  // Also check caption for topic keywords
  for (const topic of boostSet) if (caption.includes(topic)) score += 1;
  for (const topic of reduceSet) if (caption.includes(topic)) score -= 1;
  return score;
}

interface HomePageProps {
  isInviteMode?: boolean;
}

export default function HomePage({ isInviteMode = false }: HomePageProps) {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('foryou');
  const { showAds } = useShowAds();
  const { hasNewPosts, clearNewPosts } = useNewPostsBanner();
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [commandBarOpen, setCommandBarOpen] = useState(false);
  const { config: gridConfig } = useGridLayout();
  const isVisible = useCallback((id: string) => gridConfig.widgets.find(w => w.id === id)?.enabled ?? false, [gridConfig.widgets]);
  const { data: dnaPrefs } = useDNAPreferences();
  
  // Only fetch feeds for the active tab to reduce concurrent DB load
  const isForYouTab = activeTab === 'foryou';
  const isGlobalTab = activeTab === 'global';
  const isLocalTab = activeTab === 'local';

  const [globalVisited, setGlobalVisited] = useState(false);
  const [localVisited, setLocalVisited] = useState(false);

  useEffect(() => {
    if (isGlobalTab) setGlobalVisited(true);
    if (isLocalTab) setLocalVisited(true);
  }, [isGlobalTab, isLocalTab]);

  const loadGlobalFeed = globalVisited || isGlobalTab;
  const loadLocalFeed = localVisited || isLocalTab;

  // Personalized feed — only while For You tab is active
  const {
    data: forYouData,
    isLoading: forYouLoading,
    isError: forYouError,
    isFetching: forYouFetching,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = usePersonalizedFeed(undefined, { enabled: isForYouTab });

  // Following feed — merged into For You only when that tab is active
  const {
    data: followingData,
    isLoading: followingLoading,
    isFetching: followingFetching,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts(undefined, { enabled: isForYouTab });

  const {
    data: globalData,
    isLoading: globalLoading,
    isError: globalError,
    isFetching: globalFetching,
    fetchNextPage: fetchNextGlobal,
    hasNextPage: hasNextGlobal,
    isFetchingNextPage: isFetchingNextGlobal,
    refetch: refetchGlobal,
  } = useInfinitePosts('post', undefined, { enabled: loadGlobalFeed });

  const {
    data: localData,
    isLoading: localLoading,
    isError: localError,
    isFetching: localFetching,
    fetchNextPage: fetchNextLocal,
    hasNextPage: hasNextLocal,
    isFetchingNextPage: isFetchingNextLocal,
    refetch: refetchLocal,
  } = useLocalFeed({ enabled: loadLocalFeed });

  const queryClient = useQueryClient();
  const forYouPosts = useMemo(() => {
    const personalized = (forYouData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video');
    const following = (followingData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video');
    
    // Merge and deduplicate by post ID
    const seen = new Set<string>();
    const merged: Post[] = [];
    for (const post of [...following, ...personalized]) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        merged.push(post);
      }
    }

    // Apply DNA content preferences (client-side boost/reduce)
    if (dnaPrefs) {
      const boostSet = new Set((dnaPrefs.boost_topics || []).map(t => t.toLowerCase()));
      const reduceSet = new Set((dnaPrefs.reduce_topics || []).map(t => t.toLowerCase()));

      // Score posts: boost matching tags higher, reduce matching tags lower
      merged.sort((a, b) => {
        const aScore = getDNAScore(a, boostSet, reduceSet);
        const bScore = getDNAScore(b, boostSet, reduceSet);
        if (aScore !== bScore) return bScore - aScore;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      // Default: sort by date descending
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return merged;
  }, [forYouData, followingData, dnaPrefs]);
  
  const localPosts = useMemo(() => 
    localData?.pages.flatMap(page => page.posts) || [], 
    [localData]
  );

  const globalPosts = useMemo(() => 
    globalData?.pages.flatMap(page => page.posts) || [], 
    [globalData]
  );

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    clearNewPosts();
    if (activeTab === 'global') {
      queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
      await refetchGlobal();
    } else if (activeTab === 'local') {
      queryClient.invalidateQueries({ queryKey: ['local-feed'] });
      await refetchLocal();
    } else {
      queryClient.invalidateQueries({ queryKey: ['personalized-feed-v2'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
      await Promise.all([refetchForYou(), refetchFollowing()]);
    }
  }, [activeTab, queryClient, refetchForYou, refetchGlobal, refetchFollowing, refetchLocal, clearNewPosts]);

  const { pullDistance, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Infinite scroll observer - use refs for current values to avoid recreating callback
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreNodeRef = useRef<HTMLDivElement | null>(null);
  
  // Store current fetch state in refs to avoid stale closures
  const fetchStateRef = useRef({
    activeTab,
    hasNextForYou,
    hasNextFollowing,
    hasNextGlobal,
    hasNextLocal,
    isFetchingNextForYou,
    isFetchingNextFollowing,
    isFetchingNextGlobal,
    isFetchingNextLocal,
  });
  
  useEffect(() => {
    fetchStateRef.current = {
      activeTab,
      hasNextForYou,
      hasNextFollowing,
      hasNextGlobal,
      hasNextLocal,
      isFetchingNextForYou,
      isFetchingNextFollowing,
      isFetchingNextGlobal,
      isFetchingNextLocal,
    };
  }, [activeTab, hasNextForYou, hasNextFollowing, hasNextGlobal, hasNextLocal, isFetchingNextForYou, isFetchingNextFollowing, isFetchingNextGlobal, isFetchingNextLocal]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
           const state = fetchStateRef.current;
          if (state.activeTab === 'foryou') {
            if (state.hasNextForYou && !state.isFetchingNextForYou) fetchNextForYou();
            if (state.hasNextFollowing && !state.isFetchingNextFollowing) fetchNextFollowing();
          } else if (state.activeTab === 'global' && state.hasNextGlobal && !state.isFetchingNextGlobal) {
            fetchNextGlobal();
          } else if (state.activeTab === 'local' && state.hasNextLocal && !state.isFetchingNextLocal) {
            fetchNextLocal();
          }
        }
      },
      { rootMargin: '400px', threshold: 0 }
    );

    observerRef.current = observer;
    if (loadMoreNodeRef.current) observer.observe(loadMoreNodeRef.current);

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [fetchNextForYou, fetchNextFollowing, fetchNextGlobal, fetchNextLocal]);

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    // Disconnect from previous node
    if (loadMoreNodeRef.current && observerRef.current) {
      observerRef.current.unobserve(loadMoreNodeRef.current);
    }
    
    loadMoreNodeRef.current = node;
    
    // Observe new node
    if (node && observerRef.current) {
      observerRef.current.observe(node);
    }
  }, []);

  // Only redirect authenticated users to onboarding if they EXPLICITLY haven't completed it
  // Guest users can browse freely
  useEffect(() => {
    // Wait for auth to fully load
    if (authLoading) return;
    
    // If in invite mode (rendered from InviteRedeem), never redirect
    if (isInviteMode) {
      console.log('[Home] In invite mode - skipping all redirects');
      return;
    }
    
    // Guest users can browse - no redirect needed
    if (!user) {
      return;
    }

    // CRITICAL: Only redirect if we have a profile AND it explicitly says onboarding is not completed
    // If profile is null/undefined (still loading or missing), do NOT redirect - let auth handle it
    // This prevents the loop where refreshing the page triggers onboarding before profile loads
    if (profile && profile.onboarding_completed === false) {
      // Don't redirect during active referral flow or invite mode
      if (hasActiveReferral() || isInviteEntryMode()) {
        console.log('[Home] Skipping profile redirect - active referral/invite in progress');
        return;
      }
      console.log('[Home] Profile explicitly has onboarding_completed=false, redirecting...');
      navigate('/onboarding');
    }
  }, [authLoading, user, profile, navigate, isInviteMode]);

  return (
    <AppLayout>
      {/* Lazy-loaded deferred components */}
      {/* Pull to refresh indicator */}
      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isRefreshing} 
        threshold={threshold} 
      />

      <HomeEditModeProvider editing={customizerOpen} onEditingChange={setCustomizerOpen}>
        <div
          className="home-shell max-w-xl mx-auto"
          data-tutorial="tutorial-welcome-center"
          style={{
            transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : undefined,
          }}
        >
          {/* Announcement Modal */}
          <Suspense fallback={null}>
            <AnnouncementModal />
          </Suspense>
          {/* Global Events Banner */}
          <GlobalEventBanner />


          {/* Customize Button - floating glassmorphic pill with shimmer */}
          {!customizerOpen && (
            <div className="px-4 pt-1 pb-2 flex justify-center">
              <motion.button
                type="button"
                onClick={() => setCustomizerOpen(true)}
                className="home-customize-btn group"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                data-no-auto-contrast
              >
                <LayoutGrid className="h-3.5 w-3.5 text-primary" />
                <span>Customize</span>
              </motion.button>
            </div>
          )}

          {/* Dynamic ordered widget list */}
          <HomeWidgetRenderer
            customizerOpen={customizerOpen}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            showAds={showAds}
            navigate={navigate}
            hasNewPosts={hasNewPosts}
            clearNewPosts={clearNewPosts}
            handleRefresh={handleRefresh}
            forYouPosts={forYouPosts}
            forYouLoading={forYouLoading && followingLoading}
            forYouError={forYouError}
            onRetryForYou={() => { refetchForYou(); refetchFollowing(); }}
            forYouFetching={forYouFetching || followingFetching}
            isFetchingNextForYou={isFetchingNextForYou || isFetchingNextFollowing}
            globalPosts={globalPosts}
            globalLoading={globalLoading}
            globalError={globalError}
            onRetryGlobal={() => refetchGlobal()}
            globalFetching={globalFetching}
            isFetchingNextGlobal={isFetchingNextGlobal}
            localPosts={localPosts}
            localLoading={localLoading}
            localError={localError}
            onRetryLocal={() => refetchLocal()}
            localFetching={localFetching}
            isFetchingNextLocal={isFetchingNextLocal}
            loadMoreRef={loadMoreRef}
          />

          {/* Widget add FAB in edit mode */}
          {customizerOpen && <WidgetAddFAB />}
        </div>
      </HomeEditModeProvider>

      {/* AI Command Bar */}
      <SmartErrorBoundary fallback={null}>
        <Suspense fallback={null}>
          <VYBECommandBar />
        </Suspense>
      </SmartErrorBoundary>
      
      {/* Weekly Recap */}
      <Suspense fallback={null}>
        <WeeklyRecapModal />
      </Suspense>
    </AppLayout>
  );
}

/* ── FAB + button for adding widgets in edit mode ── */
function WidgetAddFAB() {
  const { localWidgets, handleToggle } = useEditMode();
  const [open, setOpen] = useState(false);
  const hidden = localWidgets.filter(w => !w.enabled);

  if (hidden.length === 0) return null;

  return (
    <>
      <motion.button
        onClick={() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          setOpen(!open);
        }}
        className="fixed left-4 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 lg:left-64 lg:top-24 lg:bottom-auto"
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Plus className="h-7 w-7" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed left-4 bottom-40 z-50 w-64 rounded-2xl border border-border/30 bg-card/95 p-3 space-y-1 shadow-2xl backdrop-blur-xl lg:left-64 lg:top-40 lg:bottom-auto"
          >
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Widget
            </p>
            {hidden.map((w, i) => (
              <motion.button
                key={w.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => {
                  handleToggle(w.id);
                  if (hidden.length <= 1) setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
              >
                <span className="text-lg">{w.icon}</span>
                <span className="flex-1 text-sm font-medium text-foreground">{w.label}</span>
                <Plus className="h-4 w-4 text-primary" />
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
