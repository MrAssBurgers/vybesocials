import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles, LayoutGrid, Eye } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePrefetchPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import type { Post } from '@/hooks/useInfinitePosts';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useNewPostsBanner } from '@/hooks/usePostsRealtime';
import { useShowAds } from '@/hooks/useShowAds';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { hasActiveReferral, isInviteEntryMode } from '@/lib/referral';
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh';
import { Button } from '@/components/ui/button';
import { AutoFriendDrop } from '@/components/friends/AutoFriendDrop';
import { GlobalEventBanner } from '@/components/events/GlobalEventBanner';
import { HomeEditModeProvider, useEditMode } from '@/components/home/HomeEditMode';
import { HomeWidgetRenderer } from '@/components/home/HomeWidgetRenderer';
import { VYBECommandBar } from '@/components/ai/VYBECommandBar';
import { useGridLayout } from '@/hooks/useGridLayout';

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
  
  // Personalized feed (interest-matched posts)
  const {
    data: forYouData,
    isLoading: forYouLoading,
    isFetching: forYouFetching,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = usePersonalizedFeed();

  // Following feed
  const {
    data: followingData,
    isLoading: followingLoading,
    isFetching: followingFetching,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts();

  // Global feed - shows ALL posts (type 'post' only, no videos/clips)
  const {
    data: globalData,
    isLoading: globalLoading,
    isFetching: globalFetching,
    fetchNextPage: fetchNextGlobal,
    hasNextPage: hasNextGlobal,
    isFetchingNextPage: isFetchingNextGlobal,
    refetch: refetchGlobal,
  } = useInfinitePosts('post');

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
    } else {
      queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
      queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
      await Promise.all([refetchForYou(), refetchFollowing()]);
    }
  }, [activeTab, queryClient, refetchForYou, refetchGlobal, refetchFollowing, clearNewPosts]);

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
    isFetchingNextForYou,
    isFetchingNextFollowing,
    isFetchingNextGlobal,
  });
  
  useEffect(() => {
    fetchStateRef.current = {
      activeTab,
      hasNextForYou,
      hasNextFollowing,
      hasNextGlobal,
      isFetchingNextForYou,
      isFetchingNextFollowing,
      isFetchingNextGlobal,
    };
  }, [activeTab, hasNextForYou, hasNextFollowing, hasNextGlobal, isFetchingNextForYou, isFetchingNextFollowing, isFetchingNextGlobal]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const state = fetchStateRef.current;
          if (state.activeTab === 'foryou') {
            // For You loads both personalized + following
            if (state.hasNextForYou && !state.isFetchingNextForYou) fetchNextForYou();
            if (state.hasNextFollowing && !state.isFetchingNextFollowing) fetchNextFollowing();
          } else if (state.activeTab === 'global' && state.hasNextGlobal && !state.isFetchingNextGlobal) {
            fetchNextGlobal();
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
  }, [fetchNextForYou, fetchNextFollowing, fetchNextGlobal]);

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
      {/* Auto FriendDrop - bump phones to add friends */}
      <AutoFriendDrop />
      
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
          {/* Announcements Banner */}
          <AnnouncementBanner />
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
            loadMoreRef={loadMoreRef}
          />

          {/* Hidden widgets in edit mode */}
          {customizerOpen && <HiddenWidgetPlaceholders />}
        </div>
      </HomeEditModeProvider>

      {/* AI Command Bar */}
      <VYBECommandBar />
    </AppLayout>
  );
}

/* ── Shows disabled widgets as tap-to-add placeholders in edit mode ── */
function HiddenWidgetPlaceholders() {
  const { localWidgets, handleToggle } = useEditMode();
  const hidden = localWidgets.filter(w => !w.enabled);

  if (hidden.length === 0) return null;

  return (
    <div className="px-4 pb-3">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hidden Widgets</p>
      <div className="flex flex-wrap gap-2">
        {hidden.map(w => (
          <button
            key={w.id}
            onClick={() => handleToggle(w.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-border/50 bg-muted/20 text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
          >
            <span className="text-sm">{w.icon}</span>
            <span className="text-xs font-medium">{w.label}</span>
            <Eye className="h-3 w-3 ml-1 text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
