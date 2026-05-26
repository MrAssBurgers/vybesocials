import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Send, Bookmark, Volume2, VolumeX, MoreVertical, Eye } from 'lucide-react';
import { ReactionPicker } from '@/components/reactions/ReactionPicker';
import { ReactionType } from '@/lib/reactions';
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
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { ShareSheet } from '@/components/share/ShareSheet';
import { HoldToShare } from '@/components/share/HoldToShare';
import { FollowPlusButton } from '@/components/clips/FollowPlusButton';

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
 * Instagram Reels-style ShortCard for mobile/iPad
 * - Single tap = toggle mute
 * - Hold = pause (no overlay)
 * - Pulsing mute icon when muted
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
  const [currentReaction, setCurrentReaction] = useState<ReactionType | null>(
    post.is_liked ? ((post as any).reaction_type as ReactionType || 'like') : null
  );
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const [isHolding, setIsHolding] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const hasCountedInitialView = useRef(false);
  const lastTapTime = useRef(0);
  const playAttemptRef = useRef<NodeJS.Timeout | null>(null);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasHoldingRef = useRef(false); // Track if we just released from a hold
  const holdStartedRef = useRef(false); // Track if hold gesture started

  // Sync view count from props (no realtime subscription needed)
  useEffect(() => {
    setViewCount(post.view_count || 0);
  }, [post.view_count]);

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

  // Handle hold-to-pause - DO NOT touch mute state here
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isHolding) {
      video.pause();
      setIsPlaying(false);
    } else if (isActive && signedMediaUrl) {
      // Resume playback without changing mute state
      video.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {});
    }
  }, [isHolding, isActive, signedMediaUrl]);

  // Track if initial autoplay happened
  const hasInitializedRef = useRef(false);

  // Simplified play/pause for mobile - mute state only changes via tap
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedMediaUrl || !isVideo) return;

    // Clear any pending play attempts
    if (playAttemptRef.current) {
      clearTimeout(playAttemptRef.current);
    }

    // Skip if holding - that's handled separately
    if (isHolding) return;

    if (isActive) {
      // Delay play slightly to allow DOM updates
      playAttemptRef.current = setTimeout(() => {
        video.playsInline = true;
        
        // Only force mute on FIRST ever autoplay for this clip
        if (!hasInitializedRef.current) {
          video.muted = globalMuted;
          setIsMuted(globalMuted);
          hasInitializedRef.current = true;
        }
        // Otherwise don't touch video.muted - preserve current state
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              // Count initial view
              if (!hasCountedInitialView.current && profile) {
                hasCountedInitialView.current = true;
                incrementViewCount();
              }
            })
            .catch((error) => {
              console.log('Video play failed:', error);
            });
        }
      }, 100);
    } else {
      video.pause();
      video.currentTime = 0;
      hasCountedInitialView.current = false;
      hasInitializedRef.current = false;
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
      const { error } = await supabase.rpc('increment_view_count', { post_id_param: post.id });
      if (error) {
        console.error('RPC error:', error);
        // Fallback: optimistically update local state
        setViewCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to increment view count:', error);
      // Fallback: optimistically update local state  
      setViewCount(prev => prev + 1);
    }
  };

  // Handle video loop/repeat - count each replay as a view
  const handleVideoEnded = useCallback(() => {
    if (profile && isActive) {
      incrementViewCount();
    }
  }, [profile, isActive]);

  // Touch handlers for hold-to-pause (Instagram-style)
  // CRITICAL: Separate hold (pause only) from tap (mute only)
  const handleTouchStart = useCallback(() => {
    holdStartedRef.current = false;
    holdTimeoutRef.current = setTimeout(() => {
      holdStartedRef.current = true;
      setIsHolding(true);
    }, 150);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    if (isHolding) {
      wasHoldingRef.current = true;
      setIsHolding(false);
      // Clear the flag after a short delay to block the click event
      setTimeout(() => {
        wasHoldingRef.current = false;
      }, 50);
    }
  }, [isHolding]);

  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // CRITICAL: If we just released from a hold, ignore this click entirely
    if (wasHoldingRef.current || isHolding || holdStartedRef.current) {
      return;
    }
    
    // CRITICAL: Only allow interactions when video is actively playing
    if (!isPlaying) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    lastTapTime.current = now;

    if (timeSinceLastTap < 300) {
      // Double tap detected — cancel pending single tap mute and trigger like
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      if (!currentReaction) {
        handleReaction('like');
        setShowHeart(true);
        setTimeout(() => setShowHeart(false), 800);
      }
    } else {
      // Delay single tap to check if a double tap follows
      singleTapTimer.current = setTimeout(() => {
        if (onToggleMute) {
          onToggleMute();
        } else if (videoRef.current) {
          const newMuted = !isMuted;
          videoRef.current.muted = newMuted;
          setIsMuted(newMuted);
        }
        singleTapTimer.current = null;
      }, 300);
    }
  }, [isMuted, onToggleMute, isLiked, isHolding, isPlaying]);

  const handleReaction = async (reactionType: ReactionType | null) => {
    if (!profile) return;

    const wasLiked = currentReaction !== null;
    const newIsLiked = reactionType !== null;
    
    setCurrentReaction(reactionType);
    setIsLiked(newIsLiked);
    setLikeCount(prev => {
      if (wasLiked && !newIsLiked) return prev - 1;
      if (!wasLiked && newIsLiked) return prev + 1;
      return prev;
    });

    if (newIsLiked) {
      await supabase.from('likes').upsert(
        { user_id: profile.id, post_id: post.id, reaction_type: reactionType } as any,
        { onConflict: 'user_id,post_id', ignoreDuplicates: false }
      );
      if (!wasLiked && post.author.id !== profile.id) {
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

  const handleShare = () => {
    setShowShareSheet(true);
  };

  const handleOpenComments = () => {
    // Pause video when opening comments
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    setShowCommentSheet(true);
  };

  const handleCloseComments = () => {
    setShowCommentSheet(false);
    // Resume video when closing comments
    if (videoRef.current && isActive) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
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
        className="absolute inset-0 flex items-center justify-center touch-pan-y"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
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
            preload="none"
            onLoadedData={() => setIsLoading(false)}
            onEnded={handleVideoEnded}
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

        {/* Instagram-style pulsing muted icon - only visible when muted AND playing */}
        {isVideo && isMuted && isPlaying && !isHolding && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
            <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center animate-pulse">
              <VolumeX className="h-10 w-10 text-white/90" />
            </div>
          </div>
        )}
      </div>

      {/* Double tap heart - fun burst effect */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            {/* Main heart with pop */}
            <motion.div
              animate={{ 
                scale: [0, 1.5, 0.85, 1.15, 1],
                rotate: [0, -20, 20, -8, 0]
              }}
              transition={{ duration: 0.6, type: 'spring', stiffness: 300 }}
            >
              <Heart className="h-36 w-36 text-rose-500 fill-rose-500 drop-shadow-2xl" />
            </motion.div>
            
            {/* Particle burst */}
            {[...Array(14)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-4 h-4 rounded-full"
                style={{ background: i % 2 === 0 ? '#f43f5e' : '#fb7185' }}
                initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                animate={{ 
                  scale: [0, 1.5, 0],
                  x: Math.cos(i * (360/14) * Math.PI / 180) * 100,
                  y: Math.sin(i * (360/14) * Math.PI / 180) * 100,
                  opacity: [1, 1, 0],
                }}
                transition={{ duration: 0.6, delay: 0.05 }}
              />
            ))}
            
            {/* Mini hearts burst */}
            {[...Array(8)].map((_, i) => (
              <motion.div
                key={`heart-${i}`}
                className="absolute"
                initial={{ scale: 0, x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{ 
                  scale: [0, 1.2, 0.6],
                  x: Math.cos((i * 45 + 22) * Math.PI / 180) * 75,
                  y: Math.sin((i * 45 + 22) * Math.PI / 180) * 75,
                  opacity: [1, 1, 0],
                  rotate: i % 2 === 0 ? 30 : -30,
                }}
                transition={{ duration: 0.7, delay: 0.1 }}
              >
                <Heart className="h-8 w-8 text-pink-400 fill-pink-400" />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none" />

      {/* Right side actions - responsive sizing for mobile/tablet */}
      <div className="absolute right-3 sm:right-4 bottom-20 sm:bottom-24 flex flex-col items-center gap-4 sm:gap-5 z-10">
        {/* Author avatar */}
        <Link to={`/u/${post.author.username}`} className="relative">
          <Avatar className="h-11 w-11 sm:h-12 sm:w-12 border-2 border-white shadow-lg">
            <AvatarImage src={signedAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-white font-bold text-sm sm:text-base">
              {post.author.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Like - Reaction Picker */}
        <div className="flex flex-col items-center gap-0.5 sm:gap-1">
          <ReactionPicker
            currentReaction={currentReaction}
            onReact={handleReaction}
            likeCount={likeCount}
            compact
            vertical
          />
          <span className="text-[11px] sm:text-xs font-bold text-white drop-shadow-lg">{likeCount}</span>
        </div>

        {/* Comment - opens bottom sheet */}
        <button 
          onClick={handleOpenComments}
          className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
        >
          <MessageCircle className="h-7 w-7 sm:h-8 sm:w-8 text-white drop-shadow-lg" />
          <span className="text-[11px] sm:text-xs font-bold text-white drop-shadow-lg">{post.comment_count}</span>
        </button>

        {/* Bookmark */}
        <button 
          onClick={handleBookmark} 
          className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
        >
          <Bookmark
            className={cn(
              "h-7 w-7 sm:h-8 sm:w-8 drop-shadow-lg",
              isBookmarked ? "fill-yellow-400 text-yellow-400" : "text-white"
            )}
          />
        </button>

        {/* Share */}
        <HoldToShare postId={post.id} postType="short" mediaUrl={post.media_url}>
          <button 
            onClick={handleShare} 
            className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
          >
            <Send className="h-7 w-7 sm:h-8 sm:w-8 text-white drop-shadow-lg" />
          </button>
        </HoldToShare>

        {/* Mute toggle */}
        {isVideo && (
          <button 
            onClick={() => onToggleMute ? onToggleMute() : setIsMuted(!isMuted)} 
            className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
          >
            {isMuted ? (
              <VolumeX className="h-6 w-6 sm:h-7 sm:w-7 text-white drop-shadow-lg" />
            ) : (
              <Volume2 className="h-6 w-6 sm:h-7 sm:w-7 text-white drop-shadow-lg" />
            )}
          </button>
        )}
      </div>

      {/* Bottom info - responsive padding and sizing */}
      <div className="absolute left-3 sm:left-4 right-16 sm:right-20 bottom-3 sm:bottom-4 z-10">
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
          <Link to={`/u/${post.author.username}`} className="flex items-center gap-1.5 sm:gap-2">
            <Avatar className="h-5 w-5 sm:h-6 sm:w-6 border border-white/50">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-white text-[10px] sm:text-xs font-bold">
                {post.author.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-bold text-base sm:text-lg text-white drop-shadow-lg">
              @{post.author.username}
            </span>
          </Link>
          <div className="flex items-center gap-1 text-white/80 text-xs sm:text-sm">
            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{formatViewCount(viewCount)}</span>
          </div>
        </div>
        {post.caption && (
          <p className="text-xs sm:text-sm text-white drop-shadow-lg line-clamp-2 mb-1.5 sm:mb-2">{post.caption}</p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {post.tags.map((tag) => (
              <span 
                key={tag} 
                className="text-[11px] sm:text-xs text-cyan-300 font-medium drop-shadow-lg"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Instagram-style comment bottom sheet */}
      <CommentSheet
        postId={post.id}
        authorId={post.author.id}
        commentCount={post.comment_count}
        isOpen={showCommentSheet}
        onClose={handleCloseComments}
      />

      {/* VYBE share sheet */}
      <ShareSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        postId={post.id}
        postType="short"
        caption={post.caption}
        mediaUrl={signedMediaUrl || post.media_url}
      />
    </div>
  );
});
