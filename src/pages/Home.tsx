import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles, LayoutGrid, Eye, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePersonalizedFeed, usePrefetchPosts } from '@/hooks/useInfinitePosts';
import { useLocalFeed } from '@/hooks/useLocalFeed';
import type { Post } from '@/hooks/useInfinitePosts';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useNewPostsBanner } from '@/hooks/usePostsRealtime';
import { useShowAds } from '@/hooks/useShowAds';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { mergedFeedPending, shouldShowFeedRefreshing, shouldShowFeedSkeleton } from '@/lib/cacheFirstLoading';
import { hasActiveReferral, isInviteEntryMode } from '@/lib/referral';
import { Button } from '@/components/ui/button';
import { GlobalEventBanner } from '@/components/events/GlobalEventBanner';
import { HomeEditModeProvider, useEditMode } from '@/components/home/HomeEditMode';
import { HomeWidgetRenderer } from '@/components/home/HomeWidgetRenderer';
import { useGridLayout } from '@/hooks/useGridLayout';
import { scrollAppTo } from '@/lib/appScrollContainer';
import { usePageMeta } from '@/hooks/usePageMeta';

// Lazy load heavy components that aren't needed for initial render
const AnnouncementModal = lazy(() => import('@/components/announcements/AnnouncementModal').then(m => ({ default: m.AnnouncementModal })));
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

const CUSTOMIZE_HINT_KEY = 'vybe-home-customize-hint-seen';

/**
 * One-time hint under the Customize pill so the opt-in widgets (wallet, shop,
 * DNA, XP…) stay discoverable after the social-first default slimmed the home.
 */
function CustomizeHomeHint({ customizerOpen }: { customizerOpen: boolean }) {
  const [show, setShow] = useState(() => {
    try {
      return localStorage.getItem(CUSTOMIZE_HINT_KEY) !== '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!customizerOpen) return;
    // Opening the customizer counts as discovering it.
    try { localStorage.setItem(CUSTOMIZE_HINT_KEY, '1'); } catch { /* private mode */ }
    setShow(false);
  }, [customizerOpen]);

  if (!show || customizerOpen) return null;

  return (
    <motion.p
      initial={{ opacity: 0, y: -2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="text-center text-[11px] text-muted-foreground -mt-1 pb-1 px-4"
      data-no-auto-contrast
    >
      Tap Customize to add widgets — wallet, shop, VYBE DNA and more
    </motion.p>
  );
}

function useHomePageMeta() {
  usePageMeta({
    title: 'VYBE — The Next Generation Social Platform',
    description: 'Your VYBE home feed: fresh clips, stories, and posts from friends and creators, personalized by VYBE DNA. Real people, real vibes, no algorithm chaos.',
    canonicalPath: '/home',
  });
}

export default function HomePage({ isInviteMode = false }: HomePageProps) {
  useHomePageMeta();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();
  const profileId = getEffectiveProfileId(profile?.id);
  const [activeTab, setActiveTab] = useState('foryou');
  const { showAds } = useShowAds();
  const { hasNewPosts, clearNewPosts } = useNewPostsBanner();
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const { config: gridConfig } = useGridLayout();
  const isVisible = useCallback((id: string) => gridConfig.widgets.find(w => w.id === id)?.enabled ?? false, [gridConfig.widgets]);
  const { data: dnaPrefs } = useDNAPreferences();
  usePrefetchPosts();
  
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
    isPending: forYouPending,
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
    isPending: followingPending,
    isFetching: followingFetching,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts(undefined, { enabled: isForYouTab && !!profileId });

  const {
    data: globalData,
    isPending: globalPending,
    isError: globalError,
    isFetching: globalFetching,
    fetchNextPage: fetchNextGlobal,
    hasNextPage: hasNextGlobal,
    isFetchingNextPage: isFetchingNextGlobal,
    refetch: refetchGlobal,
  } = useInfinitePosts('post', undefined, { enabled: loadGlobalFeed });

  const {
    data: localData,
    isPending: localPending,
    isError: localError,
    isFetching: localFetching,
    fetchNextPage: fetchNextLocal,
    hasNextPage: hasNextLocal,
    isFetchingNextPage: isFetchingNextLocal,
    refetch: refetchLocal,
  } = useLocalFeed({ enabled: loadLocalFeed });

  const queryClient = useQueryClient();
  const forYouPosts = useMemo(() => {
    const personalized = (forYouData?.pages.flatMap(page => page.posts ?? []) || [])
      .filter((post): post is Post => !!post?.id && !!post?.author?.id && (post.type === 'post' || post.type === 'video'));
    const following = (followingData?.pages.flatMap(page => page.posts ?? []) || [])
      .filter((post): post is Post => !!post?.id && !!post?.author?.id && (post.type === 'post' || post.type === 'video'));
    
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

  const forYouFeedLoading = shouldShowFeedSkeleton(
    forYouPosts.length,
    mergedFeedPending(forYouPosts.length, [forYouPending, followingPending]),
  );
  const forYouFeedRefreshing = shouldShowFeedRefreshing(
    forYouPosts.length,
    forYouFetching || followingFetching,
    mergedFeedPending(forYouPosts.length, [forYouPending, followingPending]),
  );
  const globalFeedLoading = shouldShowFeedSkeleton(globalPosts.length, globalPending);
  const globalFeedRefreshing = shouldShowFeedRefreshing(globalPosts.length, globalFetching, globalPending);
  const localFeedLoading = shouldShowFeedSkeleton(localPosts.length, localPending);
  const localFeedRefreshing = shouldShowFeedRefreshing(localPosts.length, localFetching, localPending);

  // If feed queries stall (empty cache / slow network), force a refetch once on mount.
  const feedKickRef = useRef(false);
  useEffect(() => {
    if (!isForYouTab || feedKickRef.current || forYouPosts.length > 0) return;
    feedKickRef.current = true;
    void refetchForYou();
    if (profileId) void refetchFollowing();
  }, [isForYouTab, forYouPosts.length, profileId, refetchForYou, refetchFollowing]);

  // Escape hatch: stop infinite skeleton if fetch hangs >8s.
  useEffect(() => {
    if (!isForYouTab || forYouPosts.length > 0) return;
    if (!forYouPending && !followingPending) return;
    const t = window.setTimeout(() => {
      void refetchForYou();
      if (profileId) void refetchFollowing();
    }, 8000);
    return () => window.clearTimeout(t);
  }, [
    isForYouTab,
    forYouPosts.length,
    forYouPending,
    followingPending,
    profileId,
    refetchForYou,
    refetchFollowing,
  ]);

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

  // Only redirect authenticated users to onboarding if DB says incomplete (not stale disk cache).
  const onboardingCheckedRef = useRef(false);
  useEffect(() => {
    if (authLoading || !user || isInviteMode) return;
    // One fresh-profile check per session — not on every Home visit.
    if (onboardingCheckedRef.current) return;
    onboardingCheckedRef.current = true;

    let cancelled = false;
    void (async () => {
      const fresh = await refreshProfile();
      if (cancelled || !fresh) return;

      if (fresh.onboarding_completed !== false) return;

      if (hasActiveReferral() || isInviteEntryMode()) {
        console.log('[Home] Skipping profile redirect - active referral/invite in progress');
        return;
      }
      if (document.body.hasAttribute('data-story-upload-active')) {        return;
      }      console.log('[Home] Profile explicitly has onboarding_completed=false, redirecting...');
      navigate('/onboarding');
    })();

    return () => { cancelled = true; };
  }, [authLoading, user?.id, navigate, isInviteMode, refreshProfile]);

  return (
    <AppLayout>
      <HomeEditModeProvider editing={customizerOpen} onEditingChange={setCustomizerOpen}>
        <div
          className="home-shell max-w-xl mx-auto min-h-full min-h-[100dvh]"
          data-tutorial="tutorial-welcome-center"
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
          <CustomizeHomeHint customizerOpen={customizerOpen} />

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
            forYouLoading={forYouFeedLoading}
            forYouRefreshing={forYouFeedRefreshing}
            forYouError={forYouError}
            onRetryForYou={() => { refetchForYou(); refetchFollowing(); }}
            forYouFetching={forYouFetching || followingFetching}
            isFetchingNextForYou={isFetchingNextForYou || isFetchingNextFollowing}
            globalPosts={globalPosts}
            globalLoading={globalFeedLoading}
            globalRefreshing={globalFeedRefreshing}
            globalError={globalError}
            onRetryGlobal={() => refetchGlobal()}
            globalFetching={globalFetching}
            isFetchingNextGlobal={isFetchingNextGlobal}
            localPosts={localPosts}
            localLoading={localFeedLoading}
            localRefreshing={localFeedRefreshing}
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
          scrollAppTo(0, 'smooth');
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
