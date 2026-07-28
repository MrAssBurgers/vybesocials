import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { Heart, MessageCircle, Send, Bookmark, Volume2, VolumeX, MoreVertical, Eye } from 'lucide-react';
import { ReactionPicker } from '@/components/reactions/ReactionPicker';
import { ReactionType } from '@/lib/reactions';
import { motion, AnimatePresence } from 'framer-motion';
import { T, MOTION_CONFIG } from '@/lib/motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { ShareSheet } from '@/components/share/ShareSheet';
import { HoldToShare } from '@/components/share/HoldToShare';
import { FollowPlusButton } from '@/components/clips/FollowPlusButton';
import { ClipVideoProgress } from '@/components/clips/ClipVideoProgress';
import { CLIPS_BOTTOM_UI_OFFSET } from '@/lib/clipsLayout';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { usePostReaction } from '@/hooks/usePostReaction';
import { avatarInitial } from '@/lib/parseApiDate';

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
    reaction_type?: string | null;
    view_count?: number;
  };
  isActive: boolean;
  globalMuted?: boolean;
  onToggleMute?: () => void;
  /** Full-screen clips flow (TikTok-style UX, VYBE visual language). */
  immersiveFlow?: boolean;
}

/**
 * VYBE clips card — TikTok-style flow (swipe, tabs, rail) with brand visuals.
 */
export const MobileShortCard = memo(function MobileShortCard({ 
  post, 
  isActive, 
  globalMuted = true, 
  onToggleMute,
  immersiveFlow = false,
}: MobileShortCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuted);
  const {
    isLiked,
    currentReaction,
    likeCount,
    handleReaction: persistReaction,
  } = usePostReaction(post);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const [isHolding, setIsHolding] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [showHeart, setShowHeart] = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const nativePerf = isNativePerfMode();
  const bottomUiOffset = immersiveFlow
    ? 'var(--clips-bottom-ui, ' + CLIPS_BOTTOM_UI_OFFSET + ')'
    : 'calc(env(safe-area-inset-bottom, 0px) + 16px)';
  const railBottomOffset = immersiveFlow
    ? 'calc(var(--clips-bottom-ui, ' + CLIPS_BOTTOM_UI_OFFSET + ') + 72px)'
    : 'calc(env(safe-area-inset-bottom, 0px) + 88px)';
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
      const { error } = await db.rpc('increment_view_count', { post_id_param: post.id });
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

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    };
  }, []);

  const handleReaction = useCallback(async (reactionType: ReactionType | null) => {
    if (!profile) return;
    await persistReaction(reactionType);
  }, [profile, persistReaction]);

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
  }, [isMuted, onToggleMute, isHolding, isPlaying, currentReaction, handleReaction]);

  const handleBookmark = async () => {
    if (!profile) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    if (newIsBookmarked) {
      await db.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
    } else {
      await db.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
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
        style={{ touchAction: 'pan-y' }}
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
            className={cn("h-full w-full object-cover", isLoading && "opacity-0")}
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
            className={cn("h-full w-full object-cover", isLoading && "opacity-0")}
            loading="eager"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : null}

        {/* Instagram-style pulsing muted icon - only visible when muted AND playing */}
        {isVideo && isMuted && isPlaying && !isHolding && !immersiveFlow && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
            <div className={cn(
              "w-20 h-20 rounded-full bg-black/50 flex items-center justify-center animate-pulse",
              !nativePerf && "backdrop-blur-sm",
            )}>
              <VolumeX className="h-10 w-10 text-white/90" />
            </div>
          </div>
        )}

        {isVideo && (
          <ClipVideoProgress
            videoRef={videoRef}
            isActive={isActive}
            branded={immersiveFlow}
            isMuted={isMuted}
          />
        )}
      </div>

      {/* Double tap heart — VYBE aurora burst */}
      <AnimatePresence>
        {showHeart && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={MOTION_CONFIG.spring.bouncy}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
          >
            <motion.div
              className="absolute h-32 w-32 rounded-full"
              style={{
                background:
                  'radial-gradient(circle, hsl(var(--primary) / 0.55) 0%, hsl(var(--accent) / 0.35) 40%, transparent 70%)',
              }}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: [0.4, 1.6, 2.2], opacity: [0, 0.9, 0] }}
              transition={{ duration: 0.7, ease: MOTION_CONFIG.ease.expoOut }}
            />
            <motion.div
              animate={{ scale: [0, 1.4, 0.9, 1.1, 1], rotate: [0, -15, 15, -5, 0] }}
              transition={{ duration: 0.6, ease: MOTION_CONFIG.ease.expoOut }}
              style={{ filter: 'drop-shadow(0 0 24px hsl(var(--neon-pink) / 0.7))' }}
            >
              <Heart className="h-28 w-28 text-[hsl(var(--neon-pink))] fill-[hsl(var(--neon-pink))]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Gradient overlays — subtle VYBE tint at bottom */}
      <div
        className={cn(
          'absolute inset-0 pointer-events-none',
          immersiveFlow
            ? 'bg-gradient-to-t from-black/85 via-primary/10 to-black/35'
            : 'bg-gradient-to-t from-black/80 via-transparent to-black/30',
        )}
      />

      {/* Right side actions - responsive sizing for mobile/tablet, safe-area aware */}
      <div
        className="absolute right-3 sm:right-4 flex flex-col items-center gap-4 sm:gap-5 z-10"
        style={{ bottom: railBottomOffset }}
      >
        {/* Author avatar with follow + badge */}
        <div className="relative">
          <ProfileLink
            userId={post.author.id}
            username={post.author.username}
            aria-label={`View @${post.author.username}'s profile`}
            className="story-ring rounded-full"
          >
            <Avatar className="h-11 w-11 sm:h-12 sm:w-12 border-2 border-background shadow-lg">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-white font-bold text-sm sm:text-base">
                {avatarInitial(post.author?.username)}
              </AvatarFallback>
            </Avatar>
          </ProfileLink>
          <FollowPlusButton authorId={post.author.id} />
        </div>

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
          type="button"
          aria-label={`Open comments (${post.comment_count})`}
          onClick={handleOpenComments}
          className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
        >
          <MessageCircle className="h-7 w-7 sm:h-8 sm:w-8 text-white drop-shadow-lg" />
          <span className="text-[11px] sm:text-xs font-bold text-white drop-shadow-lg">{post.comment_count}</span>
        </button>

        {/* Bookmark */}
        <button 
          type="button"
          aria-label={isBookmarked ? 'Remove saved clip' : 'Save clip'}
          aria-pressed={isBookmarked}
          onClick={handleBookmark} 
          className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
        >
          <Bookmark
            className={cn(
              "h-7 w-7 sm:h-8 sm:w-8 drop-shadow-lg",
              isBookmarked ? "fill-primary text-primary" : "text-white"
            )}
          />
        </button>

        {/* Share */}
        <HoldToShare postId={post.id} postType="short" mediaUrl={post.media_url} onTapFallback={handleShare}>
          <button 
            type="button"
            aria-label="Share clip"
            onClick={handleShare} 
            className="flex flex-col items-center gap-0.5 sm:gap-1 active:scale-90 transition-transform"
          >
            <Send className="h-7 w-7 sm:h-8 sm:w-8 text-white drop-shadow-lg" />
          </button>
        </HoldToShare>

        {/* Mute toggle */}
        {isVideo && (
          <button 
            type="button"
            aria-label={isMuted ? 'Unmute clip' : 'Mute clip'}
            aria-pressed={!isMuted}
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

      {/* Bottom info - responsive padding and sizing, safe-area aware */}
      <div
        className="absolute left-3 sm:left-4 right-16 sm:right-20 z-10"
        style={{ bottom: bottomUiOffset }}
      >
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2 flex-wrap">
          <ProfileLink userId={post.author.id} username={post.author.username} className="flex items-center gap-1.5 sm:gap-2">
            {!immersiveFlow && (
              <Avatar className="h-5 w-5 sm:h-6 sm:w-6 border border-white/50">
                <AvatarImage src={signedAvatarUrl || undefined} />
                <AvatarFallback className="bg-primary text-white text-[10px] sm:text-xs font-bold">
                  {avatarInitial(post.author?.username)}
                </AvatarFallback>
              </Avatar>
            )}
            <span
              className={cn(
                'font-bold text-base sm:text-lg drop-shadow-lg',
                immersiveFlow
                  ? 'bg-gradient-to-r from-white via-white to-primary/90 bg-clip-text text-transparent'
                  : 'text-white',
              )}
            >
              @{post.author.username}
            </span>
          </ProfileLink>
          <div className="flex items-center gap-1 text-white/80 text-xs sm:text-sm">
            <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{formatViewCount(viewCount)}</span>
          </div>
        </div>

        {isVideo && immersiveFlow && (
          <button
            type="button"
            aria-label={isMuted ? 'Play VYBE sound' : 'Mute VYBE sound'}
            onClick={() => onToggleMute ? onToggleMute() : setIsMuted((m) => !m)}
            className="flex items-center gap-2 mb-2 max-w-[min(100%,240px)] active:opacity-80"
          >
            <div
              className={cn(
                'relative w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border border-primary/40',
                'bg-gradient-to-br from-primary/30 via-accent/20 to-[hsl(var(--neon-pink)/0.25)]',
                isPlaying && !isMuted && 'animate-[spin_4s_linear_infinite]',
              )}
            >
              <VybeMiniIcon size={18} />
            </div>
            <span className="text-xs text-white/90 truncate drop-shadow-md">
              VYBE sound · @{post.author.username}
            </span>
          </button>
        )}

        {post.caption && (
          <button
            type="button"
            aria-label={captionExpanded ? 'Collapse clip caption' : 'Expand clip caption'}
            aria-expanded={captionExpanded}
            onClick={() => setCaptionExpanded((v) => !v)}
            className="text-left w-full"
          >
            <p
              className={cn(
                'text-xs sm:text-sm text-white drop-shadow-lg mb-1.5 sm:mb-2',
                !captionExpanded && 'line-clamp-2',
              )}
            >
              {post.caption}
            </p>
            {post.caption.length > 72 && !captionExpanded && (
              <span className="text-xs text-white/60 font-semibold">more</span>
            )}
          </button>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 sm:gap-1.5">
            {post.tags.slice(0, immersiveFlow ? 4 : undefined).map((tag) => (
              <span 
                key={tag} 
                className="text-[11px] sm:text-xs font-medium drop-shadow-lg text-primary"
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
        mediaUrl={signedMediaUrl || undefined}
      />
    </div>
  );
});
