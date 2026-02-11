import { memo } from 'react';
import { motion } from 'framer-motion';
import { Play, Search } from 'lucide-react';
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
}

export const ExploreVideosGrid = memo(function ExploreVideosGrid({
  videos,
  isLoading,
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

  if (videos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neon-pink/20 to-neon-cyan/20 flex items-center justify-center mb-4 border border-border/50">
          <Search className="h-8 w-8 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
        </div>
        <h3 className="text-xl font-semibold mb-2 text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">No videos found</h3>
        <p className="text-foreground/80 text-center max-w-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
          Try searching for something else or browse trending tags above
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
          <VideoCard post={post} />
        </motion.div>
      ))}
    </div>
  );
});
