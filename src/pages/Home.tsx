import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePosts, useFollowingPosts } from '@/hooks/usePosts';
import { PostCard } from '@/components/posts/PostCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [activeTab, setActiveTab] = useState('foryou');
  const { data: forYouPosts, isLoading: forYouLoading } = usePosts();
  const { data: followingPosts, isLoading: followingLoading } = useFollowingPosts();

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto">
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
            ) : forYouPosts && forYouPosts.length > 0 ? (
              forYouPosts.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PostCard post={post} />
                </motion.div>
              ))
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
            ) : followingPosts && followingPosts.length > 0 ? (
              followingPosts.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <PostCard post={post} />
                </motion.div>
              ))
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
