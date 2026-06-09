import { useMemo, useState } from 'react';
import { Play, TrendingUp, Clock, Sparkles, Film, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useRankedFeed } from '@/hooks/useRankedFeed';
import { VideoCard } from '@/components/explore/VideoCard';

const CATEGORIES = [
  { id: 'foryou', label: 'For You', icon: Sparkles },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'recent', label: 'Recent', icon: Clock },
] as const;

export default function VideoBrowse() {
  const [activeCategory, setActiveCategory] = useState<string>('foryou');
  const {
    data,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useRankedFeed({ contentType: 'video' });

  const videos = useMemo(
    () => data?.pages.flatMap((p) => p.posts) ?? [],
    [data],
  );

  // 'foryou' keeps the server ranking; other chips re-sort the loaded pages.
  const filteredVideos = useMemo(() => {
    switch (activeCategory) {
      case 'trending':
        return [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      case 'recent':
        return [...videos].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
      default:
        return videos;
    }
  }, [videos, activeCategory]);

  return (
    <AppLayout>
      <div className="p-4 pb-24 space-y-5 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-primary/10">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Watch</h1>
            <p className="text-xs text-muted-foreground">
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
            </p>
          </div>
        </div>

        {/* Category chips */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isActive = activeCategory === cat.id;
              return (
                <Button
                  key={cat.id}
                  variant={isActive ? 'default' : 'secondary'}
                  size="sm"
                  className={cn(
                    'rounded-full gap-1.5 shrink-0 transition-all',
                    isActive && 'shadow-md'
                  )}
                  onClick={() => setActiveCategory(cat.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cat.label}
                </Button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Video grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-video bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filteredVideos.length === 0 ? (
          <div className="text-center py-16">
            <Film className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium mb-1">No videos yet</p>
            <p className="text-sm text-muted-foreground">Be the first to upload a video!</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredVideos.map(post => (
                <VideoCard key={post.id} post={post} />
              ))}
            </div>
            {hasNextPage && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="secondary"
                  className="rounded-full"
                  disabled={isFetchingNextPage}
                  onClick={() => fetchNextPage()}
                >
                  {isFetchingNextPage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Load more'
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
