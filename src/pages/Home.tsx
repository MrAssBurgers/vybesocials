import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfinitePosts, useInfiniteFollowingPosts } from '@/hooks/useInfinitePosts';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { AppLayout } from '@/components/layout/AppLayout';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth';
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh';

export default function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('foryou');
  
  const {
    data: forYouData,
    isLoading: forYouLoading,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = useInfinitePosts('post');
  
  const {
    data: followingData,
    isLoading: followingLoading,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts('post');

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

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        if (activeTab === 'foryou' && hasNextForYou && !isFetchingNextForYou) {
          fetchNextForYou();
        } else if (activeTab === 'following' && hasNextFollowing && !isFetchingNextFollowing) {
          fetchNextFollowing();
        }
      }
    }, { rootMargin: '200px' });
    
    if (node) observerRef.current.observe(node);
  }, [activeTab, hasNextForYou, hasNextFollowing, isFetchingNextForYou, isFetchingNextFollowing, fetchNextForYou, fetchNextFollowing]);

  // Home feed is photo posts only (videos/clips live in Clips).

  // Redirect new Google users who don't have a profile/username yet
  useEffect(() => {
    if (!authLoading && user && !profile?.username) {
      navigate('/complete-profile');
    }
  }, [authLoading, user, profile, navigate]);

  return (
    <AppLayout>
      {/* Pull to refresh indicator */}
      <PullToRefreshIndicator 
        pullDistance={pullDistance} 
        isRefreshing={isRefreshing} 
        threshold={threshold} 
      />

      <div 
        className="max-w-xl mx-auto transition-transform duration-100"
        style={{ 
          transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : 'none' 
        }}
      >
        {/* Compact Search Bar - Mobile only, positioned higher */}
        <div className="px-4 py-2 md:hidden">
          <Link to="/explore">
            <motion.div
              whileTap={{ scale: 0.98 }}
              className="liquid-glass rounded-full px-4 py-2 flex items-center gap-2 border border-white/10"
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground text-xs">Search...</span>
            </motion.div>
          </Link>
        </div>

        {/* Announcements Banner */}
        <AnnouncementBanner />

        {/* Stories Bar */}
        <StoriesBar />
        
        <div className="px-4 pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-full mb-6 bg-secondary">
              <TabsTrigger value="foryou" className="flex-1">For You</TabsTrigger>
              <TabsTrigger value="following" className="flex-1">Following</TabsTrigger>
            </TabsList>

            <TabsContent value="foryou" className="space-y-6">
              {forYouLoading ? (
                <PostSkeletonList count={3} />
              ) : forYouPosts.length > 0 ? (
                <>
                  {forYouPosts.map((post, index) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.3) }}
                    >
                      <PostCard post={post} />
                    </motion.div>
                  ))}
                  {/* Load more trigger */}
                  <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                    {isFetchingNextForYou && (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-4xl mb-4">😴</p>
                  <p className="text-muted-foreground">No posts yet. Be the first to create one!</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="following" className="space-y-6">
              {followingLoading ? (
                <PostSkeletonList count={3} />
              ) : followingPosts.length > 0 ? (
                <>
                  {followingPosts.map((post, index) => (
                    <motion.div
                      key={post.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.05, 0.3) }}
                    >
                      <PostCard post={post} />
                    </motion.div>
                  ))}
                  {/* Load more trigger */}
                  <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                    {isFetchingNextFollowing && (
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-4xl mb-4">👀</p>
                  <p className="text-muted-foreground">Follow creators to see their posts here!</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </AppLayout>
  );
}
