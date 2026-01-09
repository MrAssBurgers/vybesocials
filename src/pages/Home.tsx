import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Loader2 } from 'lucide-react';
import { useInfinitePosts, useInfiniteFollowingPosts } from '@/hooks/useInfinitePosts';
import { PostCard } from '@/components/posts/PostCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { AnnouncementBanner } from '@/components/announcements/AnnouncementBanner';
import { useVideoPreload } from '@/hooks/useVideoPreload';

function PostSkeleton() {
  return (
    <div className="bg-card rounded-xl overflow-hidden border border-border">
      <div className="flex items-center gap-3 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="aspect-square" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState('foryou');
  
  const {
    data: forYouData,
    isLoading: forYouLoading,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
  } = useInfinitePosts();
  
  const {
    data: followingData,
    isLoading: followingLoading,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
  } = useInfiniteFollowingPosts();

  const forYouPosts = useMemo(() => 
    forYouData?.pages.flatMap(page => page.posts) || [], 
    [forYouData]
  );
  
  const followingPosts = useMemo(() => 
    followingData?.pages.flatMap(page => page.posts) || [], 
    [followingData]
  );

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

  // Preload next few videos for instant playback
  const videoUrlsToPreload = useMemo(() => {
    const posts = activeTab === 'foryou' ? forYouPosts : followingPosts;
    return posts
      .filter(post => post.type === 'video')
      .slice(0, 5)
      .map(post => post.media_url);
  }, [forYouPosts, followingPosts, activeTab]);

  useVideoPreload(videoUrlsToPreload);

  // Redirect new Google users who don't have a profile/username yet
  useEffect(() => {
    if (!authLoading && user && !profile?.username) {
      navigate('/complete-profile');
    }
  }, [authLoading, user, profile, navigate]);

  const isLoading = activeTab === 'foryou' ? forYouLoading : followingLoading;
  const isFetchingNext = activeTab === 'foryou' ? isFetchingNextForYou : isFetchingNextFollowing;
  const currentPosts = activeTab === 'foryou' ? forYouPosts : followingPosts;

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto">
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
                <>
                  <PostSkeleton />
                  <PostSkeleton />
                </>
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
                <>
                  <PostSkeleton />
                  <PostSkeleton />
                </>
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
