import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, TrendingUp, Clock, Film, Sparkles } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { usePosts } from '@/hooks/usePosts';
import { VideoCard } from '@/components/explore/VideoCard';

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Film },
  { id: 'trending', label: 'Trending', icon: TrendingUp },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'featured', label: 'Featured', icon: Sparkles },
] as const;

export default function VideoBrowse() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const { data: allPosts = [], isLoading } = usePosts();

  // Filter to only video posts
  const videos = allPosts.filter(p => p.type === 'video');

  // Sort/filter based on category
  const filteredVideos = (() => {
    switch (activeCategory) {
      case 'trending':
        return [...videos].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
      case 'recent':
        return [...videos].sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case 'featured':
        return videos.filter(v => (v.view_count || 0) > 10);
      default:
        return videos;
    }
  })();

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
            <p className="text-sm text-muted-foreground">
              {activeCategory === 'all' 
                ? 'Be the first to upload a video!'
                : 'Try a different category'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredVideos.map(post => (
              <VideoCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
