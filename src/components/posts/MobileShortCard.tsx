import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, MoreVertical, Eye } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface MobileShortCardProps {
  post: {
    id: string;
    media_url: string;
    caption: string;
    tags: string[];
    author: {
      id: string;
      username: string;
      avatar_url: string | null;
    };
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    is_bookmarked: boolean;
    view_count?: number;
  };
  isActive: boolean;
  globalMuted?: boolean;
  onToggleMute?: () => void;
}

/**
 * Simplified ShortCard for mobile/iPad - removes heavy animations that cause freezing
 */
export const MobileShortCard = memo(function MobileShortCard({ 
  post, 
  isActive, 
  globalMuted = true, 
  onToggleMute 
}: MobileShortCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuted);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const hasCountedView = useRef(false);
  const lastTapTime = useRef(0);
  const playAttemptRef = useRef<NodeJS.Timeout | null>(null);

  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);

  const isVideo = post.media_url?.includes('.mp4') || post.media_url?.includes('.webm') || post.media_url?.includes('.mov');

  // Sync with global mute state
  useEffect(() => {
    setIsMuted(globalMuted);
    if (videoRef.current) {
      videoRef.current.muted = globalMuted;
    }
  }, [globalMuted]);

  // Simplified play/pause for mobile - avoid complex state updates
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedMediaUrl || !isVideo) return;

    // Clear any pending play attempts
    if (playAttemptRef.current) {
      clearTimeout(playAttemptRef.current);
    }

    if (isActive) {
      // Delay play slightly to allow DOM updates
      playAttemptRef.current = setTimeout(() => {
        video.muted = true; // Always start muted for autoplay
        video.playsInline = true;
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              // Unmute if user preference is unmuted
              if (!globalMuted) {
                video.muted = false;
                setIsMuted(false);
              }
              // Count view
              if (!hasCountedView.current && profile) {
                hasCountedView.current = true;
                incrementViewCount();
              }
            })
            .catch((error) => {
              console.log('Video play failed:', error);
              // Video failed to play - that's ok, user can tap to play
            });
        }
      }, 100);
    } else {
      video.pause();
      video.currentTime = 0;
      hasCountedView.current = false;
      setIsPlaying(false);
    }

    return () => {
      if (playAttemptRef.current) {
        clearTimeout(playAttemptRef.current);
      }
    };
  }, [isActive, signedMediaUrl, isVideo, globalMuted, profile]);

  const incrementViewCount = async () => {
    try {
      await supabase.rpc('increment_view_count', { post_id_param: post.id });
      setViewCount(prev => prev + 1);
    } catch (error) {
      console.error('Failed to increment view count:', error);
    }
  };

  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;

    if (timeSinceLastTap < 300) {
      // Double tap - like
      if (!isLiked) {
        handleLike();
      }
    } else {
      // Single tap - toggle mute
      if (onToggleMute) {
        onToggleMute();
      } else if (videoRef.current) {
        const newMuted = !isMuted;
        videoRef.current.muted = newMuted;
        setIsMuted(newMuted);
      }
    }
    lastTapTime.current = now;
  }, [isMuted, onToggleMute, isLiked]);

  const handleLike = async () => {
    if (!profile) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id });
      if (post.author.id !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: post.author.id,
          type: 'like',
          actor_id: profile.id,
          post_id: post.id,
        });
      }
    } else {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id });
    }
  };

  const handleBookmark = async () => {
    if (!profile) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    if (newIsBookmarked) {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
    } else {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    if (navigator.share) {
      await navigator.share({ title: 'Check this out on VYBE', url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center overflow-hidden">
      {/* Media */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        onClick={handleTap}
        onTouchEnd={handleTap}
      >
        {/* Loading indicator */}
        {isLoading && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Error fallback */}
        {hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <span className="text-4xl">🎬</span>
          </div>
        )}

        {isVideo ? (
          <video
            ref={videoRef}
            src={signedMediaUrl || undefined}
            className={cn("h-full w-full object-contain", isLoading && "opacity-0")}
            loop
            playsInline
            webkit-playsinline="true"
            muted={isMuted}
            preload="metadata"
            onLoadedData={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : signedMediaUrl ? (
          <img
            src={signedMediaUrl}
            alt={post.caption}
            className={cn("h-full w-full object-contain", isLoading && "opacity-0")}
            loading="eager"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : null}

        {/* Mute indicator */}
        {isVideo && isMuted && isPlaying && (
          <div className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-full text-white text-sm flex items-center gap-2">
            <VolumeX className="h-4 w-4" />
            Tap to unmute
          </div>
        )}
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

      {/* Right side actions - simplified without heavy animations */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-10">
        {/* Author avatar */}
        <Link to={`/u/${post.author.username}`} className="relative">
          <Avatar className="h-12 w-12 border-2 border-white">
            <AvatarImage src={signedAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white font-bold">
              {post.author.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Like */}
        <button 
          onClick={handleLike} 
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <Heart
            className={cn(
              "h-8 w-8 drop-shadow-lg",
              isLiked ? "fill-red-500 text-red-500" : "text-white"
            )}
          />
          <span className="text-xs font-bold text-white drop-shadow-lg">{likeCount}</span>
        </button>

        {/* Comment */}
        <Link to={`/p/${post.id}`}>
          <button className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
            <MessageCircle className="h-8 w-8 text-white drop-shadow-lg" />
            <span className="text-xs font-bold text-white drop-shadow-lg">{post.comment_count}</span>
          </button>
        </Link>

        {/* Bookmark */}
        <button 
          onClick={handleBookmark} 
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <Bookmark
            className={cn(
              "h-8 w-8 drop-shadow-lg",
              isBookmarked ? "fill-yellow-400 text-yellow-400" : "text-white"
            )}
          />
        </button>

        {/* Share */}
        <button 
          onClick={handleShare} 
          className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
        >
          <Share2 className="h-8 w-8 text-white drop-shadow-lg" />
        </button>

        {/* Mute toggle */}
        {isVideo && (
          <button 
            onClick={() => onToggleMute ? onToggleMute() : setIsMuted(!isMuted)} 
            className="flex flex-col items-center gap-1 active:scale-90 transition-transform"
          >
            {isMuted ? (
              <VolumeX className="h-7 w-7 text-white drop-shadow-lg" />
            ) : (
              <Volume2 className="h-7 w-7 text-white drop-shadow-lg" />
            )}
          </button>
        )}
      </div>

      {/* Bottom info */}
      <div className="absolute left-4 right-20 bottom-4 z-10">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Link to={`/u/${post.author.username}`} className="font-bold text-lg text-white drop-shadow-lg">
            @{post.author.username}
          </Link>
          <div className="flex items-center gap-1 text-white/80 text-sm">
            <Eye className="h-4 w-4" />
            <span>{formatViewCount(viewCount)}</span>
          </div>
        </div>
        {post.caption && (
          <p className="text-sm text-white drop-shadow-lg line-clamp-2 mb-2">{post.caption}</p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <span 
                key={tag} 
                className="text-xs text-cyan-300 font-medium drop-shadow-lg"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
