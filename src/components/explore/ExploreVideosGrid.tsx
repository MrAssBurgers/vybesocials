import { memo } from 'react';
import { motion } from 'framer-motion';
import { Search } from 'lucide-react';
import { VideoCard } from './VideoCard';
import { MediaSkeleton } from '@/components/ui/MediaFallback';

interface VideoPost {
  id: string;
  type: string;
  media_url: string;
  thumbnail_url?: string | null;
  caption: string;
  tags?: string[];
  created_at: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  view_count?: number;
}

interface ExploreVideosGridProps {
  videos: VideoPost[];
  isLoading: boolean;
  hasFilters?: boolean;
  hasMore?: boolean;
}

export const ExploreVideosGrid = memo(function ExploreVideosGrid({
  videos,
  isLoading,
  hasFilters = false,
  hasMore = false,
}: ExploreVideosGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-7">
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div 
            key={i} 
            className="space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <MediaSkeleton className="aspect-video rounded-2xl bg-card/50" />
            <div className="flex gap-3">
              <MediaSkeleton className="h-10 w-10 rounded-full shrink-0 bg-card/50" />
              <div className="flex-1 space-y-2">
                <MediaSkeleton className="h-4 w-full bg-card/50" />
                <MediaSkeleton className="h-3 w-2/3 bg-card/50" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    );
  }

  if (videos.length === 0 && hasMore) return <p className="py-4 text-center text-sm text-muted-foreground">Continue loading to find more videos.</p>;
  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4">
        <div className="w-14 h-14 rounded-[22px] bg-primary/5 flex items-center justify-center mb-3">
          <Search className="h-8 w-8 text-foreground/65" strokeWidth={1.5} />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-foreground tracking-tight">{hasFilters ? 'No matching videos yet' : 'A little quiet here'}</h3>
        <p className="text-muted-foreground text-[13px] leading-5 text-center max-w-xs">
          {hasFilters ? 'Try another search or category to find your next favorite.' : 'New videos will appear here. Share something worth watching.'}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-7">
      {videos.map((post, index) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <VideoCard post={post} priority={index < 3} />
        </motion.div>
      ))}
    </div>
  );
});
