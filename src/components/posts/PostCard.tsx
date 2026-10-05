import { useState, useRef, memo, lazy, Suspense, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { WhyAmISeeingThisDialog } from './WhyAmISeeingThisDialog';
import { ReportContentDialog } from '@/components/safety/ReportContentDialog';
import { useSafetyReport } from '@/hooks/useSafetyReport';
import { ReactionPicker, ReactionSummary } from '@/components/reactions/ReactionPicker';
import { ReactionType } from '@/lib/reactions';
import { AnimatePresence, motion } from 'framer-motion';
import { T, MOTION_CONFIG } from '@/lib/motion';
import {
  Play,
  BadgeCheck,
  Pin,
  MoreHorizontal,
  MapPin,
  PinOff,
  Pencil,
  Trash2,
  Share2,
  Info,
  Flag,
  Heart,
  MessageCircle,
  Bookmark,
} from 'lucide-react';
import { shouldUseListMotion } from '@/lib/performanceConfig';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserProfileHoverCard } from '@/components/ui/UserProfileHoverCard';
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useDoubleTap } from '@/hooks/useGestures';
import { cn } from '@/lib/utils';
import { transformedImage, transformedSrcSet } from '@/lib/imageTransform';
import { formatDistanceToNow } from 'date-fns';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EditPostDialog } from './EditPostDialog';
import { YouTubePlayer, YouTubeLinkPreview } from '@/components/music/YouTubePlayer';
import { getRuntimeOs } from '@/lib/despiaBridge';
import { findFirstYouTubeId } from '@/lib/youtube';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { ModBadge } from '@/components/ui/ModBadge';
import { useTogglePin, PIN_LIMIT } from '@/hooks/usePosts';
import { usePinnedPostCount } from '@/hooks/usePinnedPostCount';
import { useUserRole } from '@/hooks/useModeration';
import { isModOrAdminRole } from '@/lib/adminAccess';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { useProgressiveImageSrc } from '@/hooks/useProgressiveImageSrc';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { PremiumMemeBanMenuItem, PremiumMemeBanDialog } from '@/components/premium/PremiumMemeBanItems';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { normalizeMediaUrl, firebaseStorageNeedsToken } from '@/lib/mediaUrl';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { PostCarousel } from './PostCarousel';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { useInteractionStreakBump } from '@/hooks/useInteractionStreakBump';
import { usePostReaction } from '@/hooks/usePostReaction';
import { getPostTopReactions } from '@/lib/postReactions';
import { triggerHaptic } from '@/lib/haptics';
import { useViewTracking } from '@/hooks/useViewTracking';
import { useInteractionFeedback } from '@/hooks/useInteractionFeedback';
import { AIBadge } from './AIBadge';
import { ProductTagBadge } from './ProductTagBadge';
import { useVideoAds } from '@/hooks/useVideoAds';
import { playWithAudio } from '@/lib/videoPlayback';
import { PausedMuteButton } from '@/components/video/PausedMuteButton';
import SmartErrorBoundary from '@/components/error/SmartErrorBoundary';
import { DeleteContentDialog } from './DeleteContentDialog';
// Video player component - maintains the video's native aspect ratio (no cropping)
// NEVER shows broken placeholder - graceful degradation
function VideoPlayer({ src, caption, poster }: { src: string; caption?: string; poster?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pausedByTap, setPausedByTap] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const adShownRef = useRef(false);
  const isMutedRef = useRef(false);
  const pausedByTapRef = useRef(false);
  const lastTapRef = useRef(0);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showVideoAd, scheduleMidVideoAd } = useVideoAds();
  isMutedRef.current = isMuted;
  pausedByTapRef.current = pausedByTap;

  // Retry loading up to 2 times
  useEffect(() => {
    if (hasError && retryCount < 2) {
      const timer = setTimeout(() => {
        setHasError(false);
        setRetryCount(prev => prev + 1);
      }, 1000 * (retryCount + 1));
      return () => clearTimeout(timer);
    }
  }, [hasError, retryCount]);

  // Re-arm a randomized mid-roll ad timer every time the video starts/resumes playing.
  useEffect(() => {
    if (!isPlaying) return;
    const cleanup = scheduleMidVideoAd(true);
    return cleanup;
  }, [isPlaying, scheduleMidVideoAd]);

  // Invalid URL - show subtle gradient (never broken icon)
  if (!isValidMediaUrl(src)) {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-muted/60 via-muted/40 to-muted/20 flex items-end p-4">
        {caption && <p className="text-sm text-muted-foreground/70 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  // Default to a balanced 4/5 portrait until real dimensions resolve — avoids giant
  // letterbox gaps when the video metadata is still loading.
  const ratio = dimensions ? dimensions.width / dimensions.height : 4 / 5;
  const isTall = ratio < 0.9;

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.videoWidth && el.videoHeight) {
      setDimensions({ width: el.videoWidth, height: el.videoHeight });
    }
    // Paint one nearby frame. A random seek through the file stalled Fold scrolling.
    if (!poster && el.duration > 0 && el.currentTime === 0) {
      try { el.currentTime = Math.min(0.1, el.duration / 2); } catch { /* ignore */ }
    }
  };

  const handleLoadedData = () => {
    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoaded(true);
    setHasError(true);
  };

  const togglePlayback = async () => {
    const video = videoRef.current;
    if (!video || hasError) return;
    try {
      if (!video.paused) {
        video.pause();
        setIsPlaying(false);
        setPausedByTap(true);
        return;
      }

      if (!adShownRef.current) {
        adShownRef.current = true;
        try { await showVideoAd('pre_video'); } catch (e) { console.warn('[VideoPlayer] ad failed', e); }
        if (!videoRef.current) return;
      }
      const el = videoRef.current;
      if (!el) return;
      if (!pausedByTapRef.current) {
        try { el.currentTime = 0; } catch { /* ignore */ }
      }
      const result = await playWithAudio(el, isMutedRef.current, () => setIsMuted(false));
      if (result === 'blocked') return;
      setIsMuted(result !== 'sound');
      setIsPlaying(true);
      setPausedByTap(false);
    } catch (e) {
      console.error('[VideoPlayer] handleClick crashed', e);
    }
  };

  const handleClick = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 320) {
      lastTapRef.current = 0;
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      return;
    }
    lastTapRef.current = now;
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      void togglePlayback();
    }, 320);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = !isMutedRef.current;
    video.muted = next;
    setIsMuted(next);
  };

  // Failed after retries - solid black (no broken icon, no gradient flash)
  if (hasError && retryCount >= 2) {
    return (
      <div className="w-full aspect-video bg-black flex items-end p-4">
        {caption && <p className="text-sm text-white/60 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center bg-black" onClick={handleClick}>
      <div
        className={cn(
          "relative overflow-hidden bg-black feed-video-frame",
          isTall ? "h-[70vh] w-auto max-w-full" : "w-full"
        )}
        style={{ aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : '4 / 5' }}
      >
        <video
          ref={videoRef}
          src={src}
          className={cn(
            "absolute inset-0 w-full h-full object-contain bg-black transition-opacity",
            isLoaded || poster ? "opacity-100" : "opacity-0"
          )}
          loop
          muted={isMuted}
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          poster={poster || undefined}
          style={{ backgroundColor: '#000' }}
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onError={handleError}
        />

        {/* Subtle play affordance — only after the frame is ready, low-key */}
        {isLoaded && !isPlaying && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <Play className="h-12 w-12 text-white/40" strokeWidth={1.5} fill="currentColor" />
          </div>
        )}

        {pausedByTap && !isPlaying && isLoaded && !hasError && (
          <PausedMuteButton muted={isMuted} onToggle={toggleMute} />
        )}
      </div>
    </div>
  );
}

// Natural aspect ratio image component - NO black padding, natural sizing
// NEVER shows broken placeholder - graceful degradation
function NaturalAspectImage({
  src,
  thumbnailSrc,
  caption,
  eager = false,
}: {
  src: string;
  thumbnailSrc?: string | null;
  caption?: string;
  eager?: boolean;
}) {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const { src: displaySrc } = useProgressiveImageSrc({
    full: src,
    thumb: thumbnailSrc,
    eager,
    fullWidth: eager ? 960 : 1080,
    thumbWidth: eager ? 480 : 420,
  });

  // Retry loading up to 2 times with exponential backoff
  useEffect(() => {
    if (hasError && retryCount < 2) {
      const timer = setTimeout(() => {
        setHasError(false);
        setRetryCount(prev => prev + 1);
      }, 1000 * (retryCount + 1)); // 1s, then 2s
      return () => clearTimeout(timer);
    }
  }, [hasError, retryCount]);

  if (!src && !displaySrc) {
    return (
      <div className="w-full aspect-[4/5] bg-muted/20 overflow-hidden">
        <MediaSkeleton className="w-full h-full" />
      </div>
    );
  }

  // Invalid URL - show subtle gradient (never broken icon)
  if (!isValidMediaUrl(src)) {
    return (
      <div className="w-full aspect-[4/5] bg-gradient-to-br from-muted/60 via-muted/40 to-muted/20 flex items-end p-4">
        {caption && <p className="text-sm text-muted-foreground/70 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  // Failed after retries - show subtle gradient (never broken icon)
  if (hasError && retryCount >= 2) {
    return (
      <div className="w-full aspect-[4/5] bg-gradient-to-br from-muted/60 via-muted/40 to-muted/20 flex items-end p-4">
        {caption && <p className="text-sm text-muted-foreground/70 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setHasError(false);
  };

  // Calculate aspect ratio and determine max height constraint
  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
  
  // Very tall images get limited, very wide images just flow naturally
  const isTall = aspectRatio < 0.6;
  const isWide = aspectRatio > 1.5;

  return (
    <div className="relative w-full flex items-center justify-center bg-muted/10 overflow-hidden">
      {!displaySrc && (
        <MediaSkeleton className="absolute inset-0 w-full min-h-[200px]" />
      )}
      {displaySrc && (
        <img
          key={`img-${retryCount}`}
          src={displaySrc}
          alt={caption || ''}
          className={cn(
            'w-full h-auto',
            isTall && 'max-h-[70vh] w-auto object-contain',
            isWide && 'w-full h-auto',
            !isTall && !isWide && 'w-full h-auto',
          )}
          loading={eager ? 'eager' : 'lazy'}
          decoding={eager ? 'sync' : 'async'}
          // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
          fetchpriority={eager ? 'high' : 'auto'}
          onLoad={handleLoad}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

const PostLocalAreaDialog = lazy(() => import('./PostLocalAreaDialog').then(module => ({ default: module.PostLocalAreaDialog })));

interface PostCardProps {
  post: {
    id: string;
    type: string;
    media_url: string;
    media_urls?: string[] | null;
    thumbnail_url?: string | null;
    caption: string;
    tags: string[];
    created_at: string;
    author: {
      id: string;
      username: string;
      display_name?: string | null;
      avatar_url: string | null;
      is_verified?: boolean | null;
    };
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    is_bookmarked: boolean;
    is_pinned?: boolean;
    is_ai_generated?: boolean;
    ai_confidence?: number;
    ai_override?: boolean | null;
  };
  /** Load media eagerly at high priority — only for the first couple of posts above the fold */
  eager?: boolean;
  /** Skip enter motion when the feed virtualizes (remounts would look like spasm). */
  disableEnterMotion?: boolean;
}

export const PostCard = memo(function PostCard({
  post,
  eager = false,
  disableEnterMotion = false,
}: PostCardProps) {
  const { profile } = useAuth();
  const submitSafetyReport = useSafetyReport();
  const { isGuest } = useIsGuest();
  const queryClient = useQueryClient();
  const togglePin = useTogglePin();
  const bumpStreak = useInteractionStreakBump();
  const viewRef = useViewTracking(post.id);
  const feedback = useInteractionFeedback();
  const { data: userRole } = useUserRole();
  // Defer fetching author role until menu is opened to reduce initial load
  const [menuOpen, setMenuOpen] = useState(false);
  const { data: authorRole } = useUserRoleById(menuOpen ? post.author.id : undefined);
  const isModOrAdmin = useIsModOrAdmin();
  const {
    isLiked,
    currentReaction,
    likeCount,
    handleReaction: persistReaction,
  } = usePostReaction(post);
  const { data: topReactions = [] } = useQuery({
    queryKey: ['post-top-reactions', post.id],
    queryFn: () => getPostTopReactions(post.id),
    enabled: likeCount > 0,
    staleTime: 60_000,
  });
  const summaryReactions: ReactionType[] =
    topReactions.length > 0
      ? topReactions
      : currentReaction
        ? [currentReaction]
        : [];
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  useEffect(() => { setIsBookmarked(post.is_bookmarked); }, [post.id, post.is_bookmarked]);
  const [showHeart, setShowHeart] = useState(false);
  const [showLikeParticles, setShowLikeParticles] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  const [premiumMemeBanOpen, setPremiumMemeBanOpen] = useState(false);
  const [deleteContentDialog, setDeleteContentDialog] = useState<{ type: 'post' | 'comment' | 'listing'; id: string } | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState(false);
  const [authPromptAction, setAuthPromptAction] = useState('');
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const signedMediaUrl = useFastSignedUrl(post.media_url);
  const normalizedMediaUrl = normalizeMediaUrl(post.media_url);
  // Never paint tokenless Firebase URLs — they 403 and trip the error placeholder.
  const displayMediaUrl =
    signedMediaUrl ||
    (normalizedMediaUrl && !firebaseStorageNeedsToken(normalizedMediaUrl)
      ? normalizedMediaUrl
      : null);
  const signedAvatarUrl = useFastSignedUrl(post.author.avatar_url);
  const signedThumbUrl = useFastSignedUrl(post.thumbnail_url);
  const avatarSrc = useMemo(() => {
    const raw = signedAvatarUrl || normalizeMediaUrl(post.author.avatar_url);
    return raw ? transformedImage(raw, { width: 80, height: 80, quality: 82 }) : undefined;
  }, [signedAvatarUrl, post.author.avatar_url]);

  // Memoize computed values
  const [localSharingOpen, setLocalSharingOpen] = useState(false);
  const isOwnPost = useMemo(() => profile?.id === post.author.id, [profile?.id, post.author.id]);
  const isAdmin = useMemo(() => isModOrAdminRole(userRole), [userRole]);
  const { data: pinnedCount = 0 } = usePinnedPostCount(isOwnPost ? profile?.id : undefined);
  const atPinCap = isOwnPost && !post.is_pinned && pinnedCount >= PIN_LIMIT;
  // Only the author sees the personal "Delete Post" item. Mods use Mod Actions →
  // "Delete Post (Mod)" so they never see two delete buttons on the same post.
  const canDelete = isOwnPost;
  
  // Memoize formatted date
  const formattedDate = useMemo(() => 
    formatDistanceToNow(new Date(post.created_at), { addSuffix: true }),
    [post.created_at]
  );

  const handleReport = useCallback(() => {
    if (!profile) return;
    setReportOpen(true);
  }, [profile]);

  const submitPostReport = useCallback(async (reason: string) => {
    await submitSafetyReport({ targetType: 'post', targetId: post.id, reason });
    toast.success('Post report submitted.');
  }, [post.id, submitSafetyReport]);

  const handleTogglePin = useCallback(() => {
    togglePin.mutate({ postId: post.id, isPinned: !post.is_pinned });
  }, [togglePin, post.id, post.is_pinned]);

  const handleReaction = useCallback(async (reactionType: ReactionType | null) => {
    if (isGuest) {
      setAuthPromptAction('like posts');
      setShowAuthPrompt(true);
      return;
    }
    if (!profile) return;

    const wasLiked = currentReaction !== null;
    const newIsLiked = reactionType !== null;

    if (newIsLiked && !wasLiked) {
      triggerHaptic('light');
      setShowLikeParticles(true);
      setTimeout(() => setShowLikeParticles(false), 700);
      if (post.author.id !== profile.id) bumpStreak(post.author.id);
    }

    await persistReaction(reactionType);
  }, [isGuest, profile, currentReaction, post.author.id, persistReaction]);

  const handleBookmark = useCallback(async () => {
    if (isGuest) {
      setAuthPromptAction('save posts');
      setShowAuthPrompt(true);
      return;
    }
    if (!profile) return;

    const prevIsBookmarked = isBookmarked;
    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);
    if (newIsBookmarked) feedback.onBookmark();

    try {
      if (newIsBookmarked) {
        const { error } = await db.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
        if (error) throw error;
      } else {
        const { error } = await db.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
        if (error) throw error;
      }
    } catch (error) {
      console.error('[PostCard] bookmark failed:', error);
      setIsBookmarked(prevIsBookmarked);
      toast.error("Couldn't save post — try again");
    }
  }, [profile, isBookmarked, post.id, isGuest, feedback]);

  const handleDoubleTap = useCallback(() => {
    if (!currentReaction) {
      handleReaction('like');
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  }, [currentReaction, handleReaction]);

  const handleMediaDoubleTap = useDoubleTap(handleDoubleTap);
  const isTouchFeed = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Check this out on VYBE', url });
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          navigator.clipboard.writeText(url);
          toast.success('Link copied!');
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  }, [post.id]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      // Use .select() so we can verify a row was actually removed (RLS may
      // silently filter out the delete if the user isn't the author/admin).
      const { data: deletedRows, error } = await db
        .from('posts')
        .delete()
        .eq('id', post.id)
        .select('id');

      if (error) throw error;

      if (!deletedRows || deletedRows.length === 0) {
        // RLS prevented the delete — post still exists in the database.
        toast.error("You don't have permission to delete this post");
        return;
      }

      // Log deletion for admin audit (best effort)
      if (profile?.id) {
        db.from('post_deletion_log').insert({
          post_id: post.id,
          author_id: post.author?.id ?? null,
          deleted_by: profile.id,
          post_type: (post as any).type ?? null,
          caption: post.caption ?? null,
          reason: 'user_self_delete',
        }).then(({ error: logErr }) => {
          if (logErr) console.warn('[DeletionLog] insert failed', logErr);
        });
      }

      toast.success('Post deleted');
      setDeleteDialogOpen(false);
      setIsHidden(true);
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['social-post-list'] });
      void queryClient.invalidateQueries({ queryKey: ['profile-visible-post-count'] });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      queryClient.invalidateQueries({ queryKey: ['profile-by-id'] });
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
    } finally {
      setIsDeleting(false);
    }
  }, [post.id, post.author?.id, post.caption, profile?.id, queryClient]);

  if (isHidden) return null;

  const listMotionEnabled = shouldUseListMotion() && !disableEnterMotion;
  const PostCardRoot = listMotionEnabled ? motion.article : 'article';
  const postCardMotionProps = listMotionEnabled
    ? { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: T.enter }
    : {};

  return (
    <PostCardRoot
      {...postCardMotionProps}
      ref={viewRef}
      className="relative rounded-2xl overflow-hidden bg-card/70 backdrop-blur-md border border-foreground/[0.06] feed-post-card"
    >
      {/* Subtle animated VYBE aurora outline (full perimeter, low opacity) */}
      <div aria-hidden className="post-aurora-outline" />
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <UserProfileHoverCard 
          username={post.author.username} 
          userId={post.author.id}
          avatarUrl={post.author.avatar_url}
        >
          <ProfileLink userId={post.author.id} username={post.author.username} className="flex items-center gap-3">
            <div className="story-ring">
              <Avatar className="h-10 w-10 border-2 border-background">
                <AvatarImage
                  src={avatarSrc}
                  loading={eager ? 'eager' : 'lazy'}
                  decoding={eager ? 'sync' : 'async'}
                  // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
                  fetchpriority={eager ? 'high' : 'auto'}
                />
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  {post.author.username?.[0]?.toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <p className="font-semibold text-sm flex items-center gap-1.5">
                <StyledUsername
                  userId={post.author.id}
                  username={post.author.username}
                  displayName={post.author.display_name}
                />
                {post.author.is_verified && (
                  <BadgeCheck className="h-4 w-4 text-primary fill-primary/20 flex-shrink-0" aria-label="Verified" />
                )}
                {authorRole && <ModBadge role={authorRole} />}
                {isOwner(post.author.username) && <OwnerBadge />}
                {isOwnerWife(post.author.id) && <OwnerWifeRingBadge />}
                {post.is_pinned && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    <Pin className="h-3 w-3 mr-1" />
                    Pinned
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                @{post.author.username} · {formattedDate}
              </p>
            </div>
          </ProfileLink>
        </UserProfileHoverCard>
        <div className="flex items-center gap-1">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon-sm"
                aria-label="Post options"
                onClick={event => event.stopPropagation()}
                className="transition-transform active:scale-95"
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Show author's mod badge in menu header */}
              {authorRole && (
                <div className="px-2 py-1.5 flex items-center gap-2 border-b border-border/50 mb-1">
                  <ModBadge role={authorRole} showLabel />
                </div>
              )}
              {isOwnPost && (
                <>
                  <DropdownMenuItem
                    onClick={(e) => {
                      if (atPinCap) {
                        e.preventDefault();
                        toast.info(`You can pin up to ${PIN_LIMIT} posts to your profile`);
                        return;
                      }
                      handleTogglePin();
                    }}
                    className={atPinCap ? 'opacity-60' : ''}
                  >
                    {post.is_pinned ? (
                      <>
                        <PinOff className="h-4 w-4 mr-2" />
                        Unpin from Profile
                      </>
                    ) : (
                      <>
                        <Pin className="h-4 w-4 mr-2" />
                        Pin to Profile
                        {atPinCap && <span className="ml-auto text-xs text-muted-foreground">{pinnedCount}/{PIN_LIMIT}</span>}
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setLocalSharingOpen(true)}><MapPin className="h-4 w-4 mr-2" />Local sharing</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Post
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={() => setDeleteDialogOpen(true)} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setWhyOpen(true)}>
                <Info className="h-4 w-4 mr-2" />
                Why am I seeing this?
              </DropdownMenuItem>
              {!isOwnPost && (
                <DropdownMenuItem onClick={handleReport} className="text-destructive">
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              )}
              {/* Mod actions - only visible to mods/admins and not on own content */}
              {isModOrAdmin && !isOwnPost && (
                <ModeratorMenuItems
                  userId={post.author.id}
                  username={post.author.username}
                  postId={post.id}
                  onWarnClick={() => setWarnDialogOpen(true)}
                  onBanClick={() => setBanDialogOpen(true)}
                  onMemeBanClick={() => setMemeBanDialogOpen(true)}
                  onDeleteContentClick={(type, id) => setDeleteContentDialog({ type, id })}
                  onPostDelete={() => setIsHidden(true)}
                />
              )}
              {/* Premium meme ban - available to premium users on others' posts */}
              {!isOwnPost && (
                <PremiumMemeBanMenuItem
                  userId={post.author.id}
                  username={post.author.username}
                  onOpen={() => setPremiumMemeBanOpen(true)}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {/* Mod dialogs */}
        <ModeratorDialogs
          userId={post.author.id}
          username={post.author.username}
          warnDialogOpen={warnDialogOpen}
          setWarnDialogOpen={setWarnDialogOpen}
          banDialogOpen={banDialogOpen}
          setBanDialogOpen={setBanDialogOpen}
          memeBanDialogOpen={memeBanDialogOpen}
          setMemeBanDialogOpen={setMemeBanDialogOpen}
          deleteContentDialog={deleteContentDialog}
          setDeleteContentDialog={setDeleteContentDialog}
          onPostDelete={() => setIsHidden(true)}
        />
        <PremiumMemeBanDialog
          userId={post.author.id}
          username={post.author.username}
          open={premiumMemeBanOpen}
          onOpenChange={setPremiumMemeBanOpen}
        />
      </div>

      {/* Media - carousel, single image, video, or text-only */}
      {(() => {
        const allUrls = post.media_urls && post.media_urls.length > 0
          ? post.media_urls
          : post.media_url ? [post.media_url] : [];
        
        if (allUrls.length === 0) {
          // Text-only post - no media section
          return null;
        }
        
        return (
          <div
            className="relative w-full cursor-pointer"
            onDoubleClick={handleDoubleTap}
            onClick={isTouchFeed ? handleMediaDoubleTap : undefined}
          >
            {post.type === 'video' ? (
              <SmartErrorBoundary fallback={<div className="w-full aspect-video bg-black" />}>
                <VideoPlayer src={displayMediaUrl || ''} caption={post.caption} poster={signedThumbUrl} />
              </SmartErrorBoundary>
            ) : allUrls.length > 1 ? (
              <PostCarousel urls={allUrls} onDoubleTap={handleDoubleTap} />
            ) : (
              <NaturalAspectImage
                src={displayMediaUrl || ''}
                thumbnailSrc={post.thumbnail_url}
                caption={post.caption}
                eager={eager}
              />
            )}
            
            {/* Double tap heart animation */}
            <AnimatePresence>
              {showHeart && (
                <motion.div 
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={MOTION_CONFIG.spring.bouncy}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                >
                  {/* Aurora pulse ring behind the heart */}
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
                  {/* Particle burst — uses brand neon palette */}
                  {[...Array(12)].map((_, i) => {
                    const colors = ['neon-pink', 'neon-purple', 'neon-cyan', 'primary'];
                    const color = colors[i % colors.length];
                    return (
                      <motion.div
                        key={i}
                        className="absolute w-2.5 h-2.5 rounded-full"
                        style={{ background: `hsl(var(--${color}))`, boxShadow: `0 0 12px hsl(var(--${color}))` }}
                        initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                        animate={{
                          scale: [0, 1.5, 0],
                          x: Math.cos((i * 30) * Math.PI / 180) * 90,
                          y: Math.sin((i * 30) * Math.PI / 180) * 90,
                          opacity: [1, 1, 0],
                        }}
                        transition={{ duration: 0.65, delay: 0.08, ease: MOTION_CONFIG.ease.expoOut }}
                      />
                    );
                  })}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={`heart-${i}`}
                      className="absolute"
                      initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                      animate={{
                        scale: [0, 1, 0.5],
                        x: Math.cos(((i * 60) + 30) * Math.PI / 180) * 65,
                        y: Math.sin(((i * 60) + 30) * Math.PI / 180) * 65,
                        opacity: [1, 1, 0],
                      }}
                      transition={{ duration: 0.7, delay: 0.15, ease: MOTION_CONFIG.ease.expoOut }}
                    >
                      <Heart
                        className="h-6 w-6 text-[hsl(var(--neon-pink))] fill-[hsl(var(--neon-pink))]"
                        style={{ filter: 'drop-shadow(0 0 8px hsl(var(--neon-pink)))' }}
                      />
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* AI Generated Badge */}
            {(post.is_ai_generated || post.ai_override !== undefined) && (
              <AIBadge
                postId={post.id}
                authorId={post.author.id}
                isAiGenerated={!!post.is_ai_generated}
                aiConfidence={post.ai_confidence || 0}
                aiOverride={post.ai_override ?? null}
              />
            )}
            
            {/* Product/Shop Tag Badge */}
            {post.tags && post.tags.length > 0 && (
              <div className="absolute top-3 left-3 z-10">
                <ProductTagBadge tags={post.tags} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Auto-embed: if caption contains a YouTube link, render in-app player */}
      {(() => {
        const ytId = findFirstYouTubeId(post.caption);
        if (!ytId) return null;
        return (
          <div className="px-4 pt-4">
            {/* iOS: never mount iframe_api — it auto-opens YouTube/Safari sheets on Home. */}
            {getRuntimeOs() === 'ios' ? (
              <YouTubeLinkPreview videoId={ytId} />
            ) : (
              <div className="overflow-hidden rounded-2xl border border-border/40 bg-black">
                <YouTubePlayer videoId={ytId} />
              </div>
            )}
          </div>
        );
      })()}

      {/* Caption — now ABOVE the action bar so the user's words lead */}
      {post.caption && (
        <div className="px-4 pt-4">
          <p className="text-[15px] leading-relaxed text-foreground/95">
            <UserProfileHoverCard username={post.author.username} userId={post.author.id}>
              <ProfileLink
                userId={post.author.id}
                username={post.author.username}
                className="font-bold mr-1.5 bg-gradient-to-r from-[hsl(var(--neon-pink))] via-[hsl(var(--neon-purple))] to-[hsl(var(--neon-cyan))] bg-clip-text text-transparent hover:opacity-80 transition-opacity"
                style={{ WebkitTextFillColor: 'transparent', color: 'hsl(var(--foreground))' }}
                data-no-auto-contrast
              >
                {post.author.username}
              </ProfileLink>
            </UserProfileHoverCard>
            <span className="whitespace-pre-wrap break-words">{post.caption}</span>
          </p>
        </div>
      )}

      {/* Premium action bar — gradient-bordered glass pill */}
      <div className="px-4 pt-3">
        <div
          className="relative flex items-center justify-between rounded-2xl px-3 py-2 bg-card/60 backdrop-blur-md border border-border/40 overflow-hidden"
          data-no-auto-contrast
        >
          {/* Soft neon backdrop wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-50"
            style={{
              background:
                'linear-gradient(120deg, hsl(var(--neon-pink) / 0.10), hsl(var(--neon-purple) / 0.06) 45%, hsl(var(--neon-cyan) / 0.10))',
            }}
          />
          <div className="relative flex items-center gap-1.5">
            <ReactionPicker
              currentReaction={currentReaction}
              onReact={handleReaction}
              likeCount={likeCount}
            />
            <button
              onClick={() => { feedback.onComment(); setShowCommentSheet(true); }}
              className="group relative flex items-center gap-1 h-10 px-2.5 rounded-xl active:scale-90 transition-[transform,background-color] hover:bg-foreground/5"
              aria-label="Comment"
            >
              <MessageCircle className="h-[22px] w-[22px] group-hover:text-[hsl(var(--neon-cyan))] transition-colors" />
              {post.comment_count > 0 && (
                <span className="text-xs font-semibold text-foreground/80 tabular-nums">
                  {post.comment_count}
                </span>
              )}
            </button>
            <button
              onClick={() => { feedback.onShare(); handleShare(); }}
              className="group flex items-center justify-center h-10 w-10 rounded-xl active:scale-90 transition-[transform,background-color] hover:bg-foreground/5"
              aria-label="Share"
            >
              <Share2 className="h-[22px] w-[22px] group-hover:text-[hsl(var(--neon-purple))] transition-colors" />
            </button>
          </div>

          <button
            onClick={handleBookmark}
            className="relative flex items-center justify-center h-10 w-10 rounded-xl active:scale-90 transition-[transform,background-color] hover:bg-foreground/5"
            aria-label={isBookmarked ? 'Unsave post' : 'Save post'}
            aria-pressed={isBookmarked}
          >
            <Bookmark
              className={cn(
                'h-[22px] w-[22px] transition-[color,transform]',
                isBookmarked
                  ? 'fill-yellow-400 text-yellow-400 scale-110 bookmark-glow'
                  : 'hover:text-yellow-400',
              )}
            />
          </button>
        </div>
      </div>

      {/* Reaction summary + comments link */}
      {(likeCount > 0 || post.comment_count > 0) && (
        <div className="px-5 pt-2.5 flex items-center gap-3 text-xs text-muted-foreground">
          {likeCount > 0 && (
            <ReactionSummary
              reactions={summaryReactions}
              totalCount={likeCount}
            />
          )}
          {post.comment_count > 0 && (
            <button
              onClick={() => setShowCommentSheet(true)}
              className="hover:text-foreground transition-colors"
            >
              View all {post.comment_count} comments
            </button>
          )}
        </div>
      )}

      {/* Tags — BELOW everything, as glowing neon pills */}
      {post.tags && post.tags.length > 0 && (
        <div className="px-4 pt-3 pb-4 flex flex-wrap gap-1.5" data-no-auto-contrast>

          {post.tags.map((tag, i) => {
            const palette = ['neon-pink', 'neon-purple', 'neon-cyan', 'neon-yellow'];
            const color = palette[i % palette.length];
            return (
              <Link
                key={tag}
                to={`/explore?tag=${tag}`}
                className="group relative inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded-full border border-foreground/10 bg-foreground/5 hover:bg-foreground/10 transition-[transform,background-color] hover:scale-[1.04]"
                style={{
                  color: `hsl(var(--${color}))`,
                  boxShadow: `inset 0 0 0 1px hsl(var(--${color}) / 0.25), 0 0 12px hsl(var(--${color}) / 0.10)`,
                }}
              >
                <span className="opacity-70 mr-0.5">#</span>{tag}
              </Link>
            );
          })}
        </div>
      )}

      {/* Bottom spacing if no tags */}
      {(!post.tags || post.tags.length === 0) && <div className="pb-4" />}

      {localSharingOpen && isOwnPost && <Suspense fallback={null}><PostLocalAreaDialog postId={post.id} onClose={() => setLocalSharingOpen(false)} /></Suspense>}

      {/* Edit Post Dialog */}
      <DeleteContentDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        kind="post"
      />

      {isEditOpen && (
        <EditPostDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          post={{ id: post.id, caption: post.caption, tags: post.tags }}
        />
      )}

      {/* Guest Auth Prompt */}
      <GuestAuthPrompt 
        variant="modal"
        action={authPromptAction}
        open={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
      />

      {/* Why am I seeing this? */}
      <WhyAmISeeingThisDialog
        open={whyOpen}
        onOpenChange={setWhyOpen}
        authorUsername={post.author.username}
        isFresh={(Date.now() - new Date(post.created_at).getTime()) < 1000 * 60 * 60 * 24}
        isTrending={(post.like_count + post.comment_count) >= 25}
      />

      <ReportContentDialog
        key={submitSafetyReport.sessionKey + ':' + post.id}
        open={reportOpen}
        onOpenChange={setReportOpen}
        title="Report post"
        description="Why are you reporting this post?"
        onSubmit={submitPostReport}
      />

      {/* Comment Sheet */}
      <CommentSheet
        postId={post.id}
        authorId={post.author.id}
        commentCount={post.comment_count}
        isOpen={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
      />
    </PostCardRoot>
  );
});
