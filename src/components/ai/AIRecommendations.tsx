import { motion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/posts/PostCard';
import { useSocialFeed } from '@/hooks/useSocialFeed';
import { PostListReadStatus } from '@/components/posts/PostListReadStatus';
export function AIRecommendations() {
  const feed = useSocialFeed('post', true, 'personalized');
  const posts = feed.data?.pages.flatMap(page => page.posts) ?? [];
  const isLoading = feed.isLoading || feed.isFetching;
  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VybeMiniIcon size={20} showSparkles />
          <h2 className="font-semibold">For You</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => feed.refetch()}
          disabled={isLoading}
          className="gap-1"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">Recent posts selected for you</p>

      {feed.isError ? <PostListReadStatus query={feed} /> : isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.slice(0, 3).map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <PostCard post={post} />
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-4">
          {feed.hasNextPage || feed.hasMoreWindow ? 'Continue loading to find more recommendations.' : 'No recommendations yet. Explore more content!'}
        </p>
      )}
      {!feed.isError && (feed.hasNextPage || feed.hasMoreWindow || feed.hasPreviousWindow) && posts.length === 0 && <PostListReadStatus query={feed} />}
    </div>
  );
}
