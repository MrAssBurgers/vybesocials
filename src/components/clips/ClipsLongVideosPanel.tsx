import { memo, useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Clock, Users, Sparkles } from 'lucide-react';
import { useInView } from 'react-intersection-observer';
import { usePersonalizedFeed, useInfiniteFollowingPosts } from '@/hooks/useInfinitePosts';
import { VideoCard } from '@/components/explore/VideoCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedFailureNotice } from '@/components/posts/FeedFailureNotice';
import { flattenUniqueFeedPosts } from '@/lib/feedReliability';
import { cn } from '@/lib/utils';
import { CLIPS_TOP_UI_OFFSET } from '@/lib/clipsLayout';
import type { ClipsVideoSort } from '@/lib/clipsLayout';

const SORT_CHIPS: { id: ClipsVideoSort; label: string; icon: typeof Sparkles }[] = [
  { id: 'foryou', label: 'For You', icon: Sparkles },
  { id: 'following', label: 'Following', icon: Users },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'recent', label: 'Recent', icon: Clock },
];

export const ClipsLongVideosPanel = memo(function ClipsLongVideosPanel() {
  const navigate = useNavigate();
  const [sort, setSort] = useState<ClipsVideoSort>('foryou');

  const forYouQuery = usePersonalizedFeed('video', { enabled: sort === 'foryou' || sort === 'trending' || sort === 'recent' });
  const followingQuery = useInfiniteFollowingPosts('video', { enabled: sort === 'following' });

  const activeQuery = sort === 'following' ? followingQuery : forYouQuery;
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = activeQuery;

  const videos = useMemo(() => {
    const all = flattenUniqueFeedPosts(data?.pages);
    if (sort === 'trending') {
      return [...all].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    }
    if (sort === 'recent') {
      return [...all].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return all;
  }, [data, sort]);

  const { ref: loadMoreRef, inView } = useInView({ threshold: 0, rootMargin: '600px' });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <div
      className="vybe-clips-videos-panel overflow-y-auto bg-background"
      style={{
        height: '100dvh',
        paddingTop: `calc(${CLIPS_TOP_UI_OFFSET} + 8px)`,
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
      }}
    >
      <div className="px-4 pb-2">
        <p className="text-sm text-muted-foreground">
          Long-form videos — tap to watch with full controls
        </p>
      </div>

      <div className="px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-hide">
        {SORT_CHIPS.map(({ id, label, icon: Icon }) => {
          const active = sort === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setSort(id)}
              className={cn(
                'flex items-center gap-1.5 shrink-0 min-h-11 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all',
                active
                  ? 'bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))] text-primary-foreground shadow-md'
                  : 'liquid-glass-card border border-border/40 text-muted-foreground',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-video rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : activeQuery.isError && videos.length === 0 ? (
        <div className="px-4 pt-8"><FeedFailureNotice label="videos" retrying={activeQuery.isFetching} onRetry={() => { void activeQuery.refetch(); }} /></div>
      ) : videos.length === 0 ? (
        <div className="px-4 pt-8">
          <EmptyState
            emoji="📺"
            title="No long videos yet"
            description={
              sort === 'following'
                ? 'Follow creators who post videos longer than 60 seconds'
                : 'Upload a video over 60 seconds to show up here'
            }
            actionLabel="Upload video"
            onAction={() => navigate('/upload')}
          />
        </div>
      ) : (
        <div className="px-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {videos.map((post) => (
            <VideoCard key={post.id} post={post} />
          ))}
          {hasNextPage && (
            <div ref={loadMoreRef} className="col-span-full h-12 flex items-center justify-center">
              {isFetchingNextPage && (
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});
