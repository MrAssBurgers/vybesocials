import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { VideoThumbnail } from '@/components/ui/VideoThumbnail';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface VideoCardProps {
  post: {
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
    duration?: number; // in seconds
  };
  variant?: 'default' | 'compact' | 'horizontal';
}

export const VideoCard = memo(function VideoCard({ post, variant = 'default' }: VideoCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const signedAvatar = useSignedUrl(post.author.avatar_url);

  const isVideo = post.type === 'video' || post.type === 'short';
  const viewCount = post.view_count || 0;

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M views`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K views`;
    return `${count} views`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  if (variant === 'horizontal') {
    return (
      <Link 
        to={isVideo && post.type === 'video' ? `/watch/${post.id}` : `/p/${post.id}`}
        className="flex gap-3 group"
      >
        {/* Thumbnail */}
        <div className="relative w-40 sm:w-48 aspect-video rounded-xl overflow-hidden bg-muted shrink-0">
          <VideoThumbnail
            videoUrl={post.media_url}
            thumbnailUrl={post.thumbnail_url}
            alt={post.caption}
            className="group-hover:scale-105 transition-transform duration-300"
          />
          
          {/* Duration badge */}
          {post.duration && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
              {formatDuration(post.duration)}
            </div>
          )}
          
          {/* Play icon on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <div className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center">
              <Play className="h-5 w-5 text-white ml-0.5" fill="white" />
            </div>
          </div>
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
            {post.caption || 'Untitled'}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            @{post.author.username}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatViewCount(viewCount)} • {timeAgo}
          </p>
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link 
        to={isVideo && post.type === 'video' ? `/watch/${post.id}` : `/p/${post.id}`}
        className="block group"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video rounded-lg overflow-hidden bg-muted mb-2">
          <VideoThumbnail
            videoUrl={post.media_url}
            thumbnailUrl={post.thumbnail_url}
            alt={post.caption}
            className="group-hover:scale-105 transition-transform duration-300"
          />
          
          {post.duration && (
            <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
              {formatDuration(post.duration)}
            </div>
          )}
        </div>
        
        <h3 className="font-medium text-sm line-clamp-2">{post.caption || 'Untitled'}</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatViewCount(viewCount)} • {timeAgo}
        </p>
      </Link>
    );
  }

  // Default variant - YouTube style card with enhanced styling
  return (
    <Link 
      to={isVideo && post.type === 'video' ? `/watch/${post.id}` : `/p/${post.id}`}
      className="block group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-card/50 mb-3 border border-border/30">
        <VideoThumbnail
          videoUrl={post.media_url}
          thumbnailUrl={post.thumbnail_url}
          alt={post.caption}
          className={cn(
            "transition-transform duration-300",
            isHovered && "scale-105"
          )}
        />
        
        {/* Duration badge */}
        {post.duration && (
          <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg font-medium">
            {formatDuration(post.duration)}
          </div>
        )}
        
        {/* View count badge */}
        <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-lg font-medium">
          <Eye className="h-3 w-3" />
          {formatViewCount(viewCount).replace(' views', '')}
        </div>
        
        {/* Play icon overlay on hover */}
        <div className={cn(
          "absolute inset-0 flex items-center justify-center bg-black/20 transition-all duration-300",
          isHovered ? "opacity-100" : "opacity-0"
        )}>
          <motion.div 
            initial={false}
            animate={isHovered ? { scale: 1 } : { scale: 0.8 }}
            className="w-16 h-16 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center border border-white/20"
          >
            <Play className="h-8 w-8 text-white ml-1" fill="white" />
          </motion.div>
        </div>
      </div>
      
      {/* Info */}
      <div className="flex gap-3">
        <Link to={`/u/${post.author.username}`} className="shrink-0">
          <Avatar className="h-10 w-10 ring-2 ring-border/50 ring-offset-2 ring-offset-background">
            <AvatarImage src={signedAvatar || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-neon-pink to-neon-purple text-white text-sm font-medium">
              {post.author.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold line-clamp-2 text-sm group-hover:text-primary transition-colors leading-snug">
            {post.caption || 'Untitled'}
          </h3>
          <Link 
            to={`/u/${post.author.username}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 block"
            onClick={(e) => e.stopPropagation()}
          >
            @{post.author.username}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <span>{formatViewCount(viewCount)}</span>
            <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
            <span>{timeAgo}</span>
          </div>
        </div>
      </div>
    </Link>
  );
});
