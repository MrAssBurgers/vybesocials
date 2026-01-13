import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, MoreVertical, Trash2, Flag, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { useUserRole } from '@/hooks/useModeration';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

interface ShortCardProps {
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
  isHolding?: boolean;
}

// Memoized to prevent re-renders during scroll
export const ShortCard = memo(function ShortCard({ post, isActive, globalMuted = true, onToggleMute, isHolding = false }: ShortCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuted);
  const [browserForcedMute, setBrowserForcedMute] = useState(false);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);
  const [showLikeParticles, setShowLikeParticles] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const hasCountedView = useRef(false);
  const lastTapTime = useRef(0);

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);
  const { isSlowConnection } = useNetworkStatus();

  // Sync with global mute state
  useEffect(() => {
    setIsMuted(globalMuted);
    if (videoRef.current) {
      videoRef.current.muted = globalMuted;
    }
  }, [globalMuted]);

  // Handle hold pause
  useEffect(() => {
    if (videoRef.current) {
      if (isHolding) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else if (isActive) {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [isHolding, isActive]);

  // Auto-play when active
  useEffect(() => {
    if (videoRef.current && signedMediaUrl) {
      if (isActive && !isHolding) {
        videoRef.current.muted = isMuted;
        videoRef.current.play().then(() => {
          setIsPlaying(true);
          setBrowserForcedMute(false);
          if (!hasCountedView.current && profile) {
            hasCountedView.current = true;
            incrementViewCount();
          }
        }).catch(() => {
          setBrowserForcedMute(true);
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });
      } else {
        videoRef.current.pause();
        if (!isActive) {
          videoRef.current.currentTime = 0;
          hasCountedView.current = false;
        }
        setIsPlaying(false);
      }
    }
  }, [isActive, signedMediaUrl, isHolding]);

  const incrementViewCount = async () => {
    try {
      await supabase.rpc('increment_view_count', { post_id_param: post.id });
      setViewCount(prev => prev + 1);
    } catch (error) {
      console.error('Failed to increment view count:', error);
    }
  };

  // Tap to toggle mute (single tap), double tap to like
  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    if (timeSinceLastTap < 300) {
      // Double tap - like
      handleDoubleTap();
    } else {
      // Single tap - toggle mute
      if (onToggleMute) {
        onToggleMute();
      } else if (videoRef.current) {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
      }
    }
    lastTapTime.current = now;
  }, [isMuted, onToggleMute]);

  const handleLike = async () => {
    if (!profile) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      setShowLikeParticles(true);
      setTimeout(() => setShowLikeParticles(false), 700);
    }

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

  const handleDoubleTap = () => {
    if (!isLiked) {
      handleLike();
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
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

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this clip?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      toast.success('Clip deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } catch (error) {
      console.error('Failed to delete clip:', error);
      toast.error('Failed to delete clip');
    }
  };

  const handleReport = async () => {
    if (!profile) return;
    const reason = prompt('Why are you reporting this clip?');
    if (!reason) return;

    try {
      await supabase.from('reports').insert({
        reporter_id: profile.id,
        post_id: post.id,
        reason,
      });
      toast.success('Clip reported. We will review it shortly.');
    } catch (error) {
      toast.error('Failed to report clip');
    }
  };

  const formatViewCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const isVideo = post.media_url.includes('.mp4') || post.media_url.includes('.webm') || post.media_url.includes('.mov');

  return (
    <div className="relative h-full w-full bg-black flex items-center justify-center overflow-hidden">
      {/* Media */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        onClick={handleTap}
      >
        {/* Loading skeleton */}
        {isLoading && !hasError && (
          <MediaSkeleton className="absolute inset-0" />
        )}

        {/* Error fallback */}
        {hasError && (
          <MediaFallback type={isVideo ? 'video' : 'image'} caption={post.caption} className="absolute inset-0" />
        )}

        {isVideo ? (
          <video
            ref={videoRef}
            src={signedMediaUrl || undefined}
            className={cn("h-full w-full object-contain", isLoading && "opacity-0")}
            loop
            playsInline
            muted={isMuted}
            preload={isActive ? "auto" : isSlowConnection ? "none" : "metadata"}
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
        {browserForcedMute && isMuted && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute top-4 left-4 bg-black/60 px-3 py-1.5 rounded-full text-white text-sm flex items-center gap-2"
          >
            <VolumeX className="h-4 w-4" />
            Tap to unmute
          </motion.div>
        )}

        {/* Play indicator when paused */}
        <AnimatePresence>
          {isVideo && !isPlaying && !isLoading && !hasError && !isHolding && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/20"
            >
              <motion.div
                whileTap={{ scale: 0.9 }}
                className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
              >
                <Play className="h-10 w-10 text-white ml-1" fill="white" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Double tap heart */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.5, type: 'spring', stiffness: 300 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="h-32 w-32 text-red-500 fill-red-500 drop-shadow-2xl" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

      {/* Right side actions */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5 z-10">
        {/* Author avatar */}
        <Link to={`/u/${post.author.username}`} className="relative">
          <motion.div whileTap={{ scale: 0.9 }} className="story-ring">
            <Avatar className="h-12 w-12 border-2 border-white">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="bg-gradient-to-br from-primary to-accent text-white font-bold">
                {post.author.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </motion.div>
        </Link>

        {/* Like */}
        <div className="relative">
          <motion.button 
            whileTap={{ scale: 0.7 }}
            onClick={handleLike} 
            className="flex flex-col items-center gap-1"
          >
            <motion.div 
              animate={isLiked ? { 
                scale: [1, 1.4, 0.9, 1.1, 1],
                rotate: [0, -10, 10, -5, 0]
              } : {}}
              transition={{ duration: 0.5, type: 'spring', stiffness: 400 }}
            >
              <Heart
                className={cn(
                  "h-8 w-8 drop-shadow-lg transition-colors",
                  isLiked ? "fill-red-500 text-red-500" : "text-white"
                )}
              />
            </motion.div>
            <span className="text-xs font-bold text-white drop-shadow-lg">{likeCount}</span>
          </motion.button>

          {/* Particle burst */}
          <AnimatePresence>
            {showLikeParticles && (
              <div className="absolute inset-0 pointer-events-none">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                    animate={{ 
                      scale: [0, 1, 0.5],
                      x: Math.cos(i * 45 * Math.PI / 180) * 35,
                      y: Math.sin(i * 45 * Math.PI / 180) * 35,
                      opacity: [1, 1, 0],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    className="absolute top-4 left-4 w-2 h-2 rounded-full"
                    style={{ backgroundColor: i % 2 === 0 ? '#ef4444' : '#f97316' }}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Comment */}
        <Link to={`/p/${post.id}`}>
          <motion.button 
            whileTap={{ scale: 0.7 }}
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle className="h-8 w-8 text-white drop-shadow-lg" />
            <span className="text-xs font-bold text-white drop-shadow-lg">{post.comment_count}</span>
          </motion.button>
        </Link>

        {/* Bookmark */}
        <motion.button 
          whileTap={{ scale: 0.7 }}
          animate={isBookmarked ? { scale: [1, 1.3, 1] } : {}}
          onClick={handleBookmark} 
          className="flex flex-col items-center gap-1"
        >
          <Bookmark
            className={cn(
              "h-8 w-8 drop-shadow-lg transition-colors",
              isBookmarked ? "fill-yellow-400 text-yellow-400" : "text-white"
            )}
          />
        </motion.button>

        {/* Share */}
        <motion.button 
          whileTap={{ scale: 0.7, rotate: 15 }}
          onClick={handleShare} 
          className="flex flex-col items-center gap-1"
        >
          <Share2 className="h-8 w-8 text-white drop-shadow-lg" />
        </motion.button>

        {/* Mute toggle */}
        {isVideo && (
          <motion.button 
            whileTap={{ scale: 0.7 }}
            onClick={() => onToggleMute ? onToggleMute() : setIsMuted(!isMuted)} 
            className="flex flex-col items-center gap-1"
          >
            {isMuted ? (
              <VolumeX className="h-7 w-7 text-white drop-shadow-lg" />
            ) : (
              <Volume2 className="h-7 w-7 text-white drop-shadow-lg" />
            )}
          </motion.button>
        )}

        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-white/20">
              <MoreVertical className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="liquid-glass">
            {canDelete && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Clip
              </DropdownMenuItem>
            )}
            {!isOwnPost && (
              <DropdownMenuItem onClick={handleReport} className="text-destructive">
                <Flag className="h-4 w-4 mr-2" />
                Report
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bottom info */}
      <div className="absolute left-4 right-20 bottom-4 z-10">
        <div className="flex items-center gap-2 mb-2">
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
