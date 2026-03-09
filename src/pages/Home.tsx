import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles, LayoutGrid } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePrefetchPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import type { Post } from '@/hooks/useInfinitePosts';
import { useNewPostsBanner } from '@/hooks/usePostsRealtime';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { useShowAds } from '@/hooks/useShowAds';

const FeedAdCard = lazy(() => import('@/components/ads/FeedAdCard').then(m => ({ default: m.FeedAdCard })));
import { AppLayout } from '@/components/layout/AppLayout';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { hasActiveReferral, isInviteEntryMode } from '@/lib/referral';
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh';
import { Button } from '@/components/ui/button';
import { AutoFriendDrop } from '@/components/friends/AutoFriendDrop';
import { WelcomeHeader } from '@/components/home/WelcomeHeader';
import { GlobalEventBanner } from '@/components/events/GlobalEventBanner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageTransition } from '@/components/ui/PageTransition';
import { WeeklyRhythmBanner } from '@/components/home/WeeklyRhythmBanner';
import { HomeWidgetCustomizer } from '@/components/home/HomeWidgetCustomizer';
import { VYBECommandBar } from '@/components/ai/VYBECommandBar';
import { useHomeLayout } from '@/hooks/useHomeLayout';
import { DiscoveryCards } from '@/components/home/DiscoveryCards';

// Memoized PostCard for better performance
const MemoizedPostCard = memo(PostCard);

// Memoized post list with improved empty states
interface PostListProps {
  posts: any[];
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNext: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
  emptyIcon: string;
  emptyText: string;
  onExplore?: () => void;
  showAds?: boolean;
}

const AD_INTERVAL = 5; // Show an ad every N posts

const PostList = memo(({ 
  posts, 
  isLoading,
  isFetching,
  isFetchingNext, 
  loadMoreRef,
  emptyIcon,
  emptyText,
  onExplore,
  showAds = false,
}: PostListProps) => {
  // Show skeletons only on initial load with NO cached data
  if (isLoading && posts.length === 0) {
    return <PostSkeletonList count={2} />;
  }

  if (!isLoading && posts.length === 0) {
    return (
      <EmptyState
        emoji={emptyIcon}
        title="Nothing here yet"
        description={emptyText}
        actionLabel={onExplore ? "Explore" : undefined}
        onAction={onExplore}
      />
    );
  }

  return (
    <>
      {posts.map((post, index) => (
        <div key={post.id}>
          <MemoizedPostCard post={post} />
          {/* Inject ad after every N posts */}
          {showAds && (index + 1) % AD_INTERVAL === 0 && (
            <Suspense fallback={null}>
              <FeedAdCard />
            </Suspense>
          )}
        </div>
      ))}
      <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
        {isFetchingNext && (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        )}
      </div>
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better memoization
  return (
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isFetching === nextProps.isFetching &&
    prevProps.isFetchingNext === nextProps.isFetchingNext &&
    prevProps.posts.length === nextProps.posts.length &&
    prevProps.posts === nextProps.posts &&
    prevProps.showAds === nextProps.showAds
  );
});

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
  const { isVisible } = useHomeLayout();
  
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
    // Sort by date descending (newest first)
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return merged;
  }, [forYouData, followingData]);
  
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

        {/* Welcome Header with AI Catch-up */}
        <WelcomeHeader />

        {/* Customize Button */}
        <div className="px-4 pb-2 flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCustomizerOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Customize
          </Button>
        </div>

        {/* Weekly Rhythm Banner - widget controlled */}
        {isVisible('weekly_rhythm') && <WeeklyRhythmBanner />}

        {/* Stories Bar - widget controlled */}
        {isVisible('stories') && <StoriesBar />}
        
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

            {/* X-style "New posts" banner */}
            {hasNewPosts && (
              <button
                onClick={() => {
                  clearNewPosts();
                  handleRefresh();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="w-full mb-4 py-2.5 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
              >
                <Sparkles className="h-4 w-4" />
                New posts available — tap to see
              </button>
            )}

            <TabsContent value="foryou" className="space-y-4" forceMount style={{ display: activeTab === 'foryou' ? 'block' : 'none' }}>
              <PostList
                posts={forYouPosts}
                isLoading={forYouLoading && followingLoading}
                isFetching={forYouFetching || followingFetching}
                isFetchingNext={isFetchingNextForYou || isFetchingNextFollowing}
                loadMoreRef={activeTab === 'foryou' ? loadMoreRef : () => {}}
                emptyIcon="✨"
                emptyText="No posts yet. Follow creators or check Global!"
                onExplore={() => navigate('/explore')}
                showAds={showAds}
              />
            </TabsContent>

            <TabsContent value="global" className="space-y-4" forceMount style={{ display: activeTab === 'global' ? 'block' : 'none' }}>
              <PostList
                posts={globalPosts}
                isLoading={globalLoading}
                isFetching={globalFetching}
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
      </div>

      {/* Widget Customizer */}
      <HomeWidgetCustomizer 
        open={customizerOpen} 
        onOpenChange={setCustomizerOpen}
        onOpenCommandBar={() => setCommandBarOpen(true)}
      />

      {/* AI Command Bar */}
      <VYBECommandBar />
    </AppLayout>
  );
}
