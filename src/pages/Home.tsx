import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles, LayoutGrid, Eye } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePrefetchPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
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

// Lazy load heavy components that aren't needed for initial render
const AutoFriendDrop = lazy(() => import('@/components/friends/AutoFriendDrop').then(m => ({ default: m.AutoFriendDrop })));
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

  // Personalized feed (interest-matched posts) - active on "foryou" tab
  const {
    data: forYouData,
    isLoading: forYouLoading,
    isFetching: forYouFetching,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = usePersonalizedFeed();

  // Following feed - always loaded (merged into forYou)
  const {
    data: followingData,
    isLoading: followingLoading,
    isFetching: followingFetching,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts();

  // Global feed - only fetch when tab is active or was previously visited
  const [globalVisited, setGlobalVisited] = useState(false);
  const [localVisited, setLocalVisited] = useState(false);

  useEffect(() => {
    if (isGlobalTab) setGlobalVisited(true);
    if (isLocalTab) setLocalVisited(true);
  }, [isGlobalTab, isLocalTab]);

  const {
    data: globalData,
    isLoading: globalLoading,
    isFetching: globalFetching,
    fetchNextPage: fetchNextGlobal,
    hasNextPage: hasNextGlobal,
    isFetchingNextPage: isFetchingNextGlobal,
    refetch: refetchGlobal,
  } = useInfinitePosts('post');

  // Local feed - only fetch when tab is active
  const {
    data: localData,
    isLoading: localLoading,
    isFetching: localFetching,
    fetchNextPage: fetchNextLocal,
    hasNextPage: hasNextLocal,
    isFetchingNextPage: isFetchingNextLocal,
    refetch: refetchLocal,
  } = useLocalFeed();

  // Prefetch posts for faster navigation
  usePrefetchPosts();

  // "For You" = personalized + following merged, deduped, sorted by date
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

  const queryClient = useQueryClient();

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
      queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
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
      <Suspense fallback={null}>
        <AutoFriendDrop />
      </Suspense>
      
      {/* Pull to refresh indicator */}
      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isRefreshing} 
        threshold={threshold} 
      />

      <HomeEditModeProvider editing={customizerOpen} onEditingChange={setCustomizerOpen}>
        <div 
          className="max-w-xl mx-auto"
          data-tutorial="tutorial-welcome-center"
          style={{ 
            transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : undefined 
          }}
        >
          {/* Announcement Modal */}
          <Suspense fallback={null}>
            <AnnouncementModal />
          </Suspense>
          {/* Global Events Banner */}
          <GlobalEventBanner />


          {/* Customize Button - prominent floating pill */}
          {!customizerOpen && (
            <div className="px-4 pt-2 pb-2 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCustomizerOpen(true)}
                className="rounded-full px-4 gap-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 hover:border-primary/50 shadow-sm"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Customize Home
              </Button>
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
            forYouFetching={forYouFetching || followingFetching}
            isFetchingNextForYou={isFetchingNextForYou || isFetchingNextFollowing}
            globalPosts={globalPosts}
            globalLoading={globalLoading}
            globalFetching={globalFetching}
            isFetchingNextGlobal={isFetchingNextGlobal}
            localPosts={localPosts}
            localLoading={localLoading}
            localFetching={localFetching}
            isFetchingNextLocal={isFetchingNextLocal}
            loadMoreRef={loadMoreRef}
          />

          {/* Widget add FAB in edit mode */}
          {customizerOpen && <WidgetAddFAB />}
        </div>
      </HomeEditModeProvider>

      {/* AI Command Bar */}
      <Suspense fallback={null}>
        <VYBECommandBar />
      </Suspense>
      
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
      {/* Floating + button */}
      <motion.button
        onClick={() => setOpen(!open)}
        className="fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center"
        whileTap={{ scale: 0.9 }}
        animate={{ rotate: open ? 45 : 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      >
        <Plus className="h-7 w-7" />
      </motion.button>

      {/* Widget picker overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="fixed bottom-40 right-4 z-50 w-64 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/30 shadow-2xl p-3 space-y-1"
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1">
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
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-primary/10 transition-colors text-left"
              >
                <span className="text-lg">{w.icon}</span>
                <span className="text-sm font-medium text-foreground flex-1">{w.label}</span>
                <Plus className="h-4 w-4 text-primary" />
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
