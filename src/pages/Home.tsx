import { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts, usePrefetchPosts } from '@/hooks/useInfinitePosts';
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

// Memoized PostCard for better performance
const MemoizedPostCard = memo(PostCard);

// Memoized post list with optimized rendering
const PostList = memo(({ 
  posts, 
  isLoading, 
  isFetchingNext, 
  loadMoreRef,
  emptyIcon,
  emptyText
}: { 
  posts: any[]; 
  isLoading: boolean;
  isFetchingNext: boolean;
  loadMoreRef: (node: HTMLDivElement | null) => void;
  emptyIcon: string;
  emptyText: string;
}) => {
  if (isLoading) {
    return <PostSkeletonList count={2} />;
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-4xl mb-4">{emptyIcon}</p>
        <p className="text-muted-foreground">{emptyText}</p>
      </div>
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
  
  const {
    data: forYouData,
    isLoading: forYouLoading,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = useInfinitePosts();
  
  const {
    data: followingData,
    isLoading: followingLoading,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts();

  // Prefetch posts for faster navigation
  usePrefetchPosts();

  const forYouPosts = useMemo(() => 
    forYouData?.pages.flatMap(page => page.posts) || [], 
    [forYouData]
  );
  
  const followingPosts = useMemo(() => 
    followingData?.pages.flatMap(page => page.posts) || [], 
    [followingData]
  );

  // Pull to refresh
  const handleRefresh = useCallback(async () => {
    if (activeTab === 'foryou') {
      await refetchForYou();
    } else {
      await refetchFollowing();
    }
  }, [activeTab, refetchForYou, refetchFollowing]);

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
    isFetchingNextForYou,
    isFetchingNextFollowing,
  });
  
  // Update refs when values change
  useEffect(() => {
    fetchStateRef.current = {
      activeTab,
      hasNextForYou,
      hasNextFollowing,
      isFetchingNextForYou,
      isFetchingNextFollowing,
    };
  }, [activeTab, hasNextForYou, hasNextFollowing, isFetchingNextForYou, isFetchingNextFollowing]);

  // Set up observer once and update target when it changes
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const state = fetchStateRef.current;
          if (state.activeTab === 'foryou' && state.hasNextForYou && !state.isFetchingNextForYou) {
            fetchNextForYou();
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
  }, [fetchNextForYou, fetchNextFollowing]);

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

  // Only redirect authenticated users without profile to complete-profile
  // Guest users can browse freely
  useEffect(() => {
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

    // For authenticated users without a username
    if (!profile?.username) {
      // Don't redirect during active referral flow or invite mode
      if (hasActiveReferral() || isInviteEntryMode()) {
        console.log('[Home] Skipping profile redirect - active referral/invite in progress');
        return;
      }
      navigate('/complete-profile');
    }
  }, [authLoading, user, profile, navigate, isInviteMode]);

  return (
    <AppLayout>
      {/* Pull to refresh indicator */}
      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isRefreshing} 
        threshold={threshold} 
      />

      <div 
        className="max-w-xl mx-auto"
        style={{ 
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : undefined 
        }}
      >
        {/* Announcements Banner */}
        <AnnouncementBanner />

        {/* Stories Bar */}
        <StoriesBar />
        
        <div className="px-4 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full mb-6 bg-secondary">
              <TabsTrigger value="foryou" className="flex-1">For You</TabsTrigger>
              <TabsTrigger value="following" className="flex-1">Following</TabsTrigger>
              <TabsTrigger value="communities" className="flex-1" onClick={() => navigate('/community')}>
                <Users className="h-4 w-4 mr-1" />
                Servers
              </TabsTrigger>
            </TabsList>

            <TabsContent value="foryou" className="space-y-6">
              <PostList
                posts={forYouPosts}
                isLoading={forYouLoading}
                isFetchingNext={isFetchingNextForYou}
                loadMoreRef={loadMoreRef}
                emptyIcon="😴"
                emptyText="No posts yet. Be the first to create one!"
              />
            </TabsContent>

            <TabsContent value="following" className="space-y-6">
              <PostList
                posts={followingPosts}
                isLoading={followingLoading}
                isFetchingNext={isFetchingNextFollowing}
                loadMoreRef={loadMoreRef}
                emptyIcon="👀"
                emptyText="Follow creators to see their posts here!"
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
