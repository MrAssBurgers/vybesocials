import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Globe, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePrefetchPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
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
}

const PostList = memo(({ 
  posts, 
  isLoading,
  isFetching,
  isFetchingNext, 
  loadMoreRef,
  emptyIcon,
  emptyText,
  onExplore,
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
      {posts.map((post) => (
        <MemoizedPostCard key={post.id} post={post} />
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
    prevProps.posts === nextProps.posts
  );
});

interface HomePageProps {
  isInviteMode?: boolean;
}

export default function HomePage({ isInviteMode = false }: HomePageProps) {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('foryou');
  
  // Personalized "For You" feed based on user interests
  const {
    data: forYouData,
    isLoading: forYouLoading,
    isFetching: forYouFetching,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = usePersonalizedFeed();

  // Global feed - shows ALL posts
  const {
    data: globalData,
    isLoading: globalLoading,
    isFetching: globalFetching,
    fetchNextPage: fetchNextGlobal,
    hasNextPage: hasNextGlobal,
    isFetchingNextPage: isFetchingNextGlobal,
    refetch: refetchGlobal,
  } = useInfinitePosts();
  
  const {
    data: followingData,
    isLoading: followingLoading,
    isFetching: followingFetching,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts();

  // Prefetch posts for faster navigation
  usePrefetchPosts();

  // Filter out shorts/clips - they should only appear in Clips section
  // Keep posts and videos (long-form content)
  const forYouPosts = useMemo(() => 
    (forYouData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video'), 
    [forYouData]
  );
  
  const globalPosts = useMemo(() => 
    (globalData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video'), 
    [globalData]
  );
  
  const followingPosts = useMemo(() => 
    (followingData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video'), 
    [followingData]
  );

  const queryClient = useQueryClient();

  // Pull to refresh with proper cache invalidation
  const handleRefresh = useCallback(async () => {
    if (activeTab === 'following') {
      queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
      await refetchFollowing();
    } else if (activeTab === 'global') {
      queryClient.invalidateQueries({ queryKey: ['infinite-posts'] });
      await refetchGlobal();
    } else {
      queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
      await refetchForYou();
    }
  }, [activeTab, queryClient, refetchForYou, refetchGlobal, refetchFollowing]);

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
    hasNextGlobal,
    hasNextFollowing,
    isFetchingNextForYou,
    isFetchingNextGlobal,
    isFetchingNextFollowing,
  });
  
  // Update refs when values change
  useEffect(() => {
    fetchStateRef.current = {
      activeTab,
      hasNextForYou,
      hasNextGlobal,
      hasNextFollowing,
      isFetchingNextForYou,
      isFetchingNextGlobal,
      isFetchingNextFollowing,
    };
  }, [activeTab, hasNextForYou, hasNextGlobal, hasNextFollowing, isFetchingNextForYou, isFetchingNextGlobal, isFetchingNextFollowing]);

  // Set up observer once and update target when it changes
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const state = fetchStateRef.current;
          if (state.activeTab === 'foryou' && state.hasNextForYou && !state.isFetchingNextForYou) {
            fetchNextForYou();
          } else if (state.activeTab === 'global' && state.hasNextGlobal && !state.isFetchingNextGlobal) {
            fetchNextGlobal();
          } else if (state.activeTab === 'following' && state.hasNextFollowing && !state.isFetchingNextFollowing) {
            fetchNextFollowing();
          }
        }
      },
      { rootMargin: '400px', threshold: 0 }
    );

    observerRef.current = observer;

    // If the sentinel node already mounted before this effect ran, start observing it now.
    if (loadMoreNodeRef.current) {
      observer.observe(loadMoreNodeRef.current);
    }

    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, [fetchNextForYou, fetchNextGlobal, fetchNextFollowing]);

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

        {/* Stories Bar */}
        <StoriesBar />
        
        <div className="px-3 pb-6" data-tutorial="feed-area">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full mb-5 h-11 p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="foryou" className="flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Sparkles className="h-4 w-4 mr-1.5" />
                For You
              </TabsTrigger>
              <TabsTrigger value="following" className="flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Following
              </TabsTrigger>
              <TabsTrigger value="global" className="flex-1 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Globe className="h-4 w-4 mr-1.5" />
                Global
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foryou" className="space-y-4" forceMount style={{ display: activeTab === 'foryou' ? 'block' : 'none' }}>
              <PostList
                posts={forYouPosts}
                isLoading={forYouLoading}
                isFetching={forYouFetching}
                isFetchingNext={isFetchingNextForYou}
                loadMoreRef={activeTab === 'foryou' ? loadMoreRef : () => {}}
                emptyIcon="✨"
                emptyText="No posts matching your interests yet. Explore or check Global!"
                onExplore={() => navigate('/explore')}
              />
            </TabsContent>

            <TabsContent value="following" className="space-y-4" forceMount style={{ display: activeTab === 'following' ? 'block' : 'none' }}>
              <PostList
                posts={followingPosts}
                isLoading={followingLoading}
                isFetching={followingFetching}
                isFetchingNext={isFetchingNextFollowing}
                loadMoreRef={activeTab === 'following' ? loadMoreRef : () => {}}
                emptyIcon="👋"
                emptyText="Follow creators to see their posts here!"
                onExplore={() => navigate('/explore')}
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
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
