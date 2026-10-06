import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { MapPinDialogLoader } from '@/components/vybemap/MapPinDialogLoader';
import { Heart, MessageCircle, Send, Bookmark, Play, Eye } from 'lucide-react';
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
import { useResolvedMediaUrl } from '@/hooks/useFastSignedUrl';
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
import { playWithAudio, cancelVideoAudioUnlock } from '@/lib/videoPlayback';
import { applyConfirmedPostView } from '@/lib/postViewService';
import { usePostMutations } from '@/hooks/usePostMutations';
import { isVideoPostMedia } from '@/lib/isVideoPostMedia';
import { PausedMuteButton } from '@/components/video/PausedMuteButton';
import { useClipPageVisible } from '@/hooks/useClipPageVisible';
import { useClipNetworkRecovery } from '@/hooks/useClipNetworkRecovery';
import { useClipMediaSource } from '@/hooks/useClipMediaSource';

interface MobileShortCardProps {
  post: {
    type?: string;
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
  globalMuted = false, 
  onToggleMute,
  immersiveFlow = false,
}: MobileShortCardProps) {
  const { profile } = useAuth();
  const pageVisible = useClipPageVisible();
  const postActions = usePostMutations(post.id);
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pausedByTap, setPausedByTap] = useState(false);
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
  const [mapPinOpen, setMapPinOpen] = useState(false);
  useEffect(() => { setMapPinOpen(false); }, [profile?.id, post.id]);
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
  const userPausedRef = useRef(false);

  // Sync view count from props (no realtime subscription needed)
  useEffect(() => {
    setViewCount(post.view_count || 0);
  }, [post.view_count]);

  const media = useResolvedMediaUrl(post.media_url, isActive && pageVisible);
  const signedMediaUrl = media.url;
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);

  const isVideo = isVideoPostMedia(post);
  const videoSource = useClipMediaSource(videoRef, signedMediaUrl, isVideo && isActive && pageVisible);
  useEffect(() => { if (videoSource) { setIsLoading(true); setHasError(false); } }, [videoSource]);
  const resetPlaybackError = useCallback(() => { setHasError(false); setIsLoading(true); }, []);
  const playbackActive = isActive && pageVisible && !isHolding && !showCommentSheet;
  const recovery = useClipNetworkRecovery(videoRef, playbackActive && isVideo, signedMediaUrl, postActions.contextKey, userPausedRef, resetPlaybackError);
  const playbackFailed = hasError || recovery.stalled || media.error;
  const playbackContext = useMemo(() => ({ active: playbackActive }), [playbackActive, signedMediaUrl, globalMuted, postActions.contextKey]);
  useEffect(() => {
    playbackContext.active = playbackActive;
    const video = videoRef.current;
    return () => {
      playbackContext.active = false;
      if (video) { cancelVideoAudioUnlock(video); video.pause(); }
    };
  }, [playbackContext]);

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
    }
  }, [isHolding, isActive, signedMediaUrl]);

  // Track if initial autoplay happened
  const hasInitializedRef = useRef(false);

  // Simplified play/pause for mobile - mute state only changes via tap
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !signedMediaUrl || !isVideo) return;
    let current = true;

    if (!pageVisible || showCommentSheet) {
      video.pause(); setIsPlaying(false);
      return;
    }

    // Clear any pending play attempts
    if (playAttemptRef.current) {
      clearTimeout(playAttemptRef.current);
    }

    // Skip if holding - that's handled separately
    if (isHolding) return;

    if (isActive) {
      if (userPausedRef.current) {
        video.muted = globalMuted;
        setIsMuted(globalMuted);
        return;
      }
      // Delay play slightly to allow DOM updates
      playAttemptRef.current = setTimeout(() => {
        if (userPausedRef.current) return;
        video.playsInline = true;
        hasInitializedRef.current = true;
        void playWithAudio(video, globalMuted, () => setIsMuted(false), () => current && !userPausedRef.current).then((result) => {
          if (!current || result === 'blocked' || userPausedRef.current) return;
          setIsMuted(result !== 'sound');
          setIsPlaying(true);
          if (!hasCountedInitialView.current && profile) {
            hasCountedInitialView.current = true;
            incrementViewCount();
          }
        });
      }, 100);
    } else {
      video.pause();
      video.currentTime = 0;
      hasCountedInitialView.current = false;
      hasInitializedRef.current = false;
      userPausedRef.current = false;
      setPausedByTap(false);
      setIsPlaying(false);
    }

    return () => {
      current = false;
      cancelVideoAudioUnlock(video);
      video.pause();
      if (playAttemptRef.current) {
        clearTimeout(playAttemptRef.current);
      }
    };
  }, [isActive, pageVisible, showCommentSheet, signedMediaUrl, isVideo, globalMuted, profile?.id, postActions.contextKey, isHolding, recovery.revision]);

  const incrementViewCount = async () => {
    await applyConfirmedPostView(postActions.actor, post.id, postActions.guard, setViewCount);
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
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    lastTapTime.current = now;

    if (timeSinceLastTap < 300) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      if (!currentReaction) {
        handleReaction('like');
        setShowHeart(true);
        setTimeout(() => setShowHeart(false), 800);
      }
      return;
    }

    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      const video = videoRef.current;
      if (!video || !playbackContext.active) return;
      if (video.paused) {
        userPausedRef.current = false;
        setPausedByTap(false);
        void playWithAudio(video, video.muted, () => setIsMuted(false), () => playbackContext.active && !userPausedRef.current).then((result) => {
          if (!playbackContext.active || result === 'blocked') return;
          setIsMuted(result !== 'sound');
          setIsPlaying(true);
        });
      } else {
        userPausedRef.current = true;
        video.pause();
        setIsPlaying(false);
        setPausedByTap(true);
      }
    }, 300);
  }, [isHolding, currentReaction, handleReaction, playbackContext]);

  const handleBookmark = async () => {
    if (!profile) return;

    const previous = isBookmarked;
    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    try {
      const result = newIsBookmarked
        ? await db.from('bookmarks').insert({ user_id: profile.id, post_id: post.id })
        : await db.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
      if (result.error) throw result.error;
    } catch (error) {
      console.error('[MobileShortCard] bookmark failed:', error);
      setIsBookmarked(previous);
      toast.error("Couldn't save clip — try again");
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
        {isLoading && !playbackFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
            <div className="w-10 h-10 border-3 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* Error fallback */}
        {playbackFailed && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            {isVideo ? <button className="rounded-full bg-black/60 px-5 py-3 text-sm font-semibold text-white" onClick={e => { e.stopPropagation(); if (media.error) { resetPlaybackError(); media.retry(); } else recovery.retry(); }}>Retry clip</button> : <span className="text-4xl">🖼️</span>}
          </div>
        )}

        {isVideo ? (
          <video
            ref={videoRef}
            src={videoSource}
            className={cn("h-full w-full object-cover", isLoading && "opacity-0")}
            loop
            playsInline
            webkit-playsinline="true"
            muted={isMuted}
            preload="none"
            onLoadedData={() => { setIsLoading(false); setHasError(false); }}
            onEnded={handleVideoEnded}
            onError={() => {
              if (!videoSource) return;
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

        {isVideo && pausedByTap && !isPlaying && !isLoading && !playbackFailed && !isHolding && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45">
              <Play className="h-8 w-8 text-white ml-0.5" fill="white" />
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
      </div>

      {isVideo && pausedByTap && !isPlaying && !isHolding && (
        <PausedMuteButton
          muted={isMuted}
          onToggle={() => {
            const next = !(videoRef.current?.muted ?? isMuted);
            if (videoRef.current) videoRef.current.muted = next;
            setIsMuted(next);
            if (onToggleMute && next !== globalMuted) onToggleMute();
          }}
          className="right-3 top-[calc(var(--app-header-safe,env(safe-area-inset-top,0px))+4.5rem)] z-50"
        />
      )}

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
          <div
            className="flex items-center gap-2 mb-2 max-w-[min(100%,240px)] pointer-events-none"
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
          </div>
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
      {profile?.id === post.author.id && <Button size="sm" variant="secondary" className="absolute right-3 top-20 z-20" onClick={() => setMapPinOpen(true)}>Map sharing</Button>}
      {mapPinOpen && profile?.id === post.author.id && <MapPinDialogLoader sourceId={post.id} kind="clip" onClose={() => setMapPinOpen(false)} />}
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
