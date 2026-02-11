import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, Eye, Clock } from 'lucide-react';
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
    duration?: number;
  };
  variant?: 'default' | 'compact' | 'horizontal';
}

export const VideoCard = memo(function VideoCard({ post, variant = 'default' }: VideoCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const signedAvatar = useSignedUrl(post.author.avatar_url);

  const isVideo = post.type === 'video' || post.type === 'short';
  const viewCount = post.view_count || 0;

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return `${count}`;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });
  const linkTo = isVideo && post.type === 'video' ? `/watch/${post.id}` : `/p/${post.id}`;

  if (variant === 'horizontal') {
    return (
      <Link to={linkTo} className="flex gap-3 group">
        <div className="relative w-40 sm:w-48 aspect-video rounded-xl overflow-hidden bg-muted shrink-0">
          <VideoThumbnail
            videoUrl={post.media_url}
            thumbnailUrl={post.thumbnail_url}
            alt={post.caption}
            className="group-hover:scale-105 transition-transform duration-300"
          />
          {post.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded-md font-medium">
              {formatDuration(post.duration)}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors leading-snug">
            {post.caption || 'Untitled'}
          </h3>
          <p className="text-xs text-muted-foreground mt-1.5">@{post.author.username}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatViewCount(viewCount)} views • {timeAgo}
          </p>
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link to={linkTo} className="block group">
        <div className="relative aspect-video rounded-xl overflow-hidden bg-muted mb-2">
          <VideoThumbnail
            videoUrl={post.media_url}
            thumbnailUrl={post.thumbnail_url}
            alt={post.caption}
            className="group-hover:scale-105 transition-transform duration-300"
          />
          {post.duration && (
            <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] px-1.5 py-0.5 rounded-md font-medium">
              {formatDuration(post.duration)}
            </div>
          )}
        </div>
        <h3 className="font-medium text-sm line-clamp-2 leading-snug">{post.caption || 'Untitled'}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {formatViewCount(viewCount)} views • {timeAgo}
        </p>
      </Link>
    );
  }

  // Default variant — Clean, airy YouTube-style card
  return (
    <Link 
      to={linkTo}
      className="block group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail — clean rounded corners, no border clutter */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted/60">
        <VideoThumbnail
          videoUrl={post.media_url}
          thumbnailUrl={post.thumbnail_url}
          alt={post.caption}
          className={cn(
            "transition-transform duration-500 ease-out",
            isHovered && "scale-[1.06]"
          )}
        />
        
        {/* Duration pill — bottom right */}
        {post.duration && (
          <div className="absolute bottom-2 right-2 bg-black/75 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded-md font-semibold tracking-wide">
            {formatDuration(post.duration)}
          </div>
        )}
        
        {/* Centered play button on hover — satisfying scale-up */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={false}
          animate={{ opacity: isHovered ? 1 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="bg-black/40 absolute inset-0" />
          <motion.div 
            initial={false}
            animate={{ scale: isHovered ? 1 : 0.5 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className="relative z-10 w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30"
          >
            <Play className="h-5 w-5 text-primary-foreground ml-0.5" fill="currentColor" />
          </motion.div>
        </motion.div>
      </div>
      
      {/* Info row — avatar + text, generous spacing */}
      <div className="flex gap-3 mt-3">
        <Link 
          to={`/u/${post.author.username}`} 
          className="shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={signedAvatar || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
              {post.author.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[13px] leading-[1.3] line-clamp-2 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] group-hover:text-primary transition-colors">
            {post.caption || 'Untitled'}
          </h3>
          <div className="flex items-center gap-1 mt-1">
            <Link 
              to={`/u/${post.author.username}`}
              className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] hover:text-foreground transition-colors truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {post.author.username}
            </Link>
          </div>
          <p className="text-[11px] text-foreground/50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mt-0.5">
            {formatViewCount(viewCount)} views · {timeAgo}
          </p>
        </div>
      </div>
    </Link>
  );
});
