import { useState, useRef, memo, useCallback, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Pencil, Trash2, Pin, PinOff, Flag, Volume2, VolumeX, Play, Type } from 'lucide-react';
import { ReactionPicker, ReactionSummary } from '@/components/reactions/ReactionPicker';
import { ReactionType } from '@/lib/reactions';
import { AnimatePresence, motion } from 'framer-motion';
import { T, MOTION_CONFIG } from '@/lib/motion';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EditPostDialog } from './EditPostDialog';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { ModBadge } from '@/components/ui/ModBadge';
import { useTogglePin } from '@/hooks/usePosts';
import { useUserRole } from '@/hooks/useModeration';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { PremiumMemeBanMenuItem, PremiumMemeBanDialog } from '@/components/premium/PremiumMemeBanItems';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { useIsGuest, GuestAuthPrompt } from '@/components/auth/GuestAuthPrompt';
import { PostCarousel } from './PostCarousel';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { useInteractionStreakBump } from '@/hooks/useInteractionStreakBump';
import { triggerHaptic } from '@/lib/haptics';
import { useViewTracking } from '@/hooks/useViewTracking';
import { useInteractionFeedback } from '@/hooks/useInteractionFeedback';
import { AIBadge } from './AIBadge';
import { ProductTagBadge } from './ProductTagBadge';
// Video player component - maintains the video's native aspect ratio (no cropping)
// NEVER shows broken placeholder - graceful degradation
function VideoPlayer({ src, caption }: { src: string; caption?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

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

  // Invalid URL - show subtle gradient (never broken icon)
  if (!isValidMediaUrl(src)) {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-muted/60 via-muted/40 to-muted/20 flex items-end p-4">
        {caption && <p className="text-sm text-muted-foreground/70 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  const ratio = dimensions ? dimensions.width / dimensions.height : 9 / 16;
  const isTall = ratio < 0.9;

  const handleLoadedMetadata = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.videoWidth && el.videoHeight) {
      setDimensions({ width: el.videoWidth, height: el.videoHeight });
    }
  };

  const handleLoadedData = () => {
    const el = videoRef.current;
    if (!el) return;

    // Seek a tiny bit forward for a more interesting thumbnail frame
    const duration = el.duration;
    if (duration > 0) {
      const randomTime = Math.random() * Math.min(duration, 10);
      try {
        el.currentTime = randomTime;
      } catch {
        // ignore
      }
    }

    setIsLoaded(true);
    setHasError(false);
  };

  const handleError = () => {
    setIsLoaded(true);
    setHasError(true);
  };

  const handleClick = () => {
    if (!videoRef.current || hasError) return;

    if (!isPlaying) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  // Failed after retries - show subtle gradient (never broken icon)
  if (hasError && retryCount >= 2) {
    return (
      <div className="w-full aspect-video bg-gradient-to-br from-muted/60 via-muted/40 to-muted/20 flex items-end p-4">
        {caption && <p className="text-sm text-muted-foreground/70 line-clamp-2">✨ {caption}</p>}
      </div>
    );
  }

  return (
    <div className="w-full flex justify-center bg-muted/30" onClick={handleClick}>
      <div
        className={cn(
          "relative overflow-hidden bg-muted",
          isTall ? "h-[70vh] w-auto max-w-full" : "w-full"
        )}
        style={{ aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : '9 / 16' }}
      >
        {/* Loading skeleton */}
        {!isLoaded && <MediaSkeleton className="absolute inset-0" />}

        <video
          ref={videoRef}
          src={src}
          className={cn(
            "absolute inset-0 w-full h-full object-contain transition-opacity",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          loop
          muted={isMuted}
          playsInline
          webkit-playsinline="true"
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onLoadedData={handleLoadedData}
          onError={handleError}
        />

        {/* Play indicator when not playing - CSS only */}
        {!isPlaying && isLoaded && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="hover:scale-110 active:scale-90 transition-transform">
              <Play className="h-16 w-16 text-white/90 fill-white/90" />
            </div>
          </div>
        )}

        {/* Mute/Unmute button when playing */}
        {isPlaying && !hasError && (
          <button
            onClick={toggleMute}
            className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 text-white active:scale-90 transition-transform"
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

// Natural aspect ratio image component - NO black padding, natural sizing
// NEVER shows broken placeholder - graceful degradation
function NaturalAspectImage({ src, caption }: { src: string; caption?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

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
    setIsLoaded(true);
    setHasError(false);
  };

  // Calculate aspect ratio and determine max height constraint
  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
  
  // Very tall images get limited, very wide images just flow naturally
  const isTall = aspectRatio < 0.6;
  const isWide = aspectRatio > 1.5;

  return (
    <div className="relative w-full flex items-center justify-center bg-muted/10 overflow-hidden">
      {/* Blur-up placeholder while loading */}
      {!isLoaded && (
        <div className="w-full aspect-square">
          <div 
            className="absolute inset-0 bg-gradient-to-br from-primary/10 via-muted/30 to-accent/10 animate-pulse"
            style={{ filter: 'blur(20px)', transform: 'scale(1.1)' }}
          />
          <MediaSkeleton className="absolute inset-0" />
        </div>
      )}
      <img
        key={retryCount}
        src={src}
        alt={caption || ''}
        className={cn(
          "w-full h-auto transition-all duration-500 ease-out",
          isTall && "max-h-[70vh] w-auto object-contain",
          isWide && "w-full h-auto",
          !isTall && !isWide && "w-full h-auto",
          isLoaded ? "opacity-100 blur-0 scale-100" : "opacity-0 blur-sm scale-[1.02]"
        )}
        style={!isLoaded ? { position: 'absolute', top: 0, left: 0 } : undefined}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        onLoad={handleLoad}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

interface PostCardProps {
  post: {
    id: string;
    type: string;
    media_url: string;
    media_urls?: string[] | null;
    caption: string;
    tags: string[];
    created_at: string;
    author: {
      id: string;
      username: string;
      display_name?: string | null;
      avatar_url: string | null;
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
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const { profile } = useAuth();
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
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [currentReaction, setCurrentReaction] = useState<ReactionType | null>(
    post.is_liked ? ((post as any).reaction_type as ReactionType || 'like') : null
  );
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
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

  const signedMediaUrl = useFastSignedUrl(post.media_url);
  const signedAvatarUrl = useFastSignedUrl(post.author.avatar_url);

  // Memoize computed values
  const isOwnPost = useMemo(() => profile?.id === post.author.id, [profile?.id, post.author.id]);
  const isAdmin = useMemo(() => userRole === 'admin' || userRole === 'moderator', [userRole]);
  const canDelete = isOwnPost || isAdmin;
  
  // Memoize formatted date
  const formattedDate = useMemo(() => 
    formatDistanceToNow(new Date(post.created_at), { addSuffix: true }),
    [post.created_at]
  );

  const handleReport = useCallback(async () => {
    if (!profile) return;
    const reason = prompt('Why are you reporting this post?');
    if (!reason) return;

    try {
      await supabase.from('reports').insert({
        reporter_id: profile.id,
        post_id: post.id,
        reason,
      });
      toast.success('Post reported. We will review it shortly.');
    } catch (error) {
      toast.error('Failed to report post');
    }
  }, [profile, post.id]);

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
    
    setCurrentReaction(reactionType);
    setIsLiked(newIsLiked);
    setLikeCount(prev => {
      if (wasLiked && !newIsLiked) return prev - 1;
      if (!wasLiked && newIsLiked) return prev + 1;
      return prev; // Changed reaction type, count stays same
    });

    if (newIsLiked && !wasLiked) {
      triggerHaptic('light');
      setShowLikeParticles(true);
      setTimeout(() => setShowLikeParticles(false), 700);
    }

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
        bumpStreak(post.author.id);
      }
    } else {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id });
    }
  }, [profile, currentReaction, post.id, post.author.id, isGuest]);

  const handleBookmark = useCallback(async () => {
    if (isGuest) {
      setAuthPromptAction('save posts');
      setShowAuthPrompt(true);
      return;
    }
    if (!profile) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);
    if (newIsBookmarked) feedback.onBookmark();

    if (newIsBookmarked) {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
    } else {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
    }
  }, [profile, isBookmarked, post.id, isGuest]);

  const handleDoubleTap = useCallback(() => {
    if (!currentReaction) {
      handleReaction('like');
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  }, [currentReaction, handleReaction]);

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
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
    }
  }, [post.id, queryClient]);

  return (
    <motion.article
      ref={viewRef}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={T.enter}
      className="relative rounded-2xl overflow-hidden bg-card/60 backdrop-blur-md"
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
          <Link to={`/u/${post.author.username}`} className="flex items-center gap-3">
            <div className="story-ring">
              <Avatar className="h-10 w-10 border-2 border-background">
                <AvatarImage src={signedAvatarUrl || undefined} />
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  {post.author.username[0].toUpperCase()}
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
          </Link>
        </UserProfileHoverCard>
        <div className="flex items-center gap-1">
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon-sm"
                onPointerDown={(e) => {
                  // Prevent Radix from opening on pointerdown
                  e.preventDefault();
                  e.stopPropagation();
                  const el = e.currentTarget as any;
                  el._ptrStart = { x: e.clientX, y: e.clientY, time: Date.now() };
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  const el = e.currentTarget as any;
                  const start = el._ptrStart;
                  if (!start) return;
                  const dx = Math.abs(e.clientX - start.x);
                  const dy = Math.abs(e.clientY - start.y);
                  const dt = Date.now() - start.time;
                  // Cancel if finger moved >10px or tap shorter than 50ms
                  if (dx > 10 || dy > 10 || dt < 50) return;
                  // Debounce: block repeat taps within 300ms
                  if (el._lastTap && Date.now() - el._lastTap < 300) return;
                  el._lastTap = Date.now();
                  setMenuOpen(prev => !prev);
                }}
                onClick={(e) => {
                  // Prevent default click from also toggling
                  e.preventDefault();
                  e.stopPropagation();
                }}
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
                  <DropdownMenuItem onClick={handleTogglePin}>
                    {post.is_pinned ? (
                      <>
                        <PinOff className="h-4 w-4 mr-2" />
                        Unpin Post
                      </>
                    ) : (
                      <>
                        <Pin className="h-4 w-4 mr-2" />
                        Pin to Profile
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit Post
                  </DropdownMenuItem>
                </>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
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
          <div className="relative w-full cursor-pointer" onDoubleClick={handleDoubleTap}>
            {post.type === 'video' ? (
              <VideoPlayer src={signedMediaUrl || ''} caption={post.caption} />
            ) : allUrls.length > 1 ? (
              <PostCarousel urls={allUrls} onDoubleTap={handleDoubleTap} />
            ) : (
              <NaturalAspectImage src={signedMediaUrl || ''} caption={post.caption} />
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

      {/* Actions - 44px touch targets */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between h-11">
          {/* Left action buttons */}
          <div className="flex items-center gap-4">
            <ReactionPicker
              currentReaction={currentReaction}
              onReact={handleReaction}
              likeCount={likeCount}
            />

            <button onClick={() => { feedback.onComment(); setShowCommentSheet(true); }} className="flex flex-col items-center justify-center h-11 w-11 active:scale-90 transition-transform">
              <MessageCircle className="h-6 w-6 hover:text-primary transition-colors" />
              {post.comment_count > 0 && <span className="text-[10px] text-muted-foreground leading-none mt-0.5">{post.comment_count}</span>}
            </button>
            
            <button 
              onClick={() => { feedback.onShare(); handleShare(); }}
              className="flex items-center justify-center h-11 w-11 active:scale-90 transition-transform"
            >
              <Share2 className="h-6 w-6 hover:text-primary transition-colors" />
            </button>
          </div>
          
          {/* Bookmark button */}
          <button 
            onClick={handleBookmark}
            className="flex items-center justify-center h-11 w-11 active:scale-90 transition-transform"
          >
            <Bookmark
              className={cn(
                "h-6 w-6 transition-all",
                isBookmarked ? "fill-yellow-400 text-yellow-400 scale-110 bookmark-glow" : "hover:text-primary"
              )}
            />
          </button>
        </div>

        {/* Reaction Summary */}
        {likeCount > 0 ? (
          <ReactionSummary
            reactions={currentReaction ? [currentReaction] : []}
            totalCount={likeCount}
          />
        ) : null}

        {/* Caption */}
        {post.caption && (
          <p className="text-sm">
            <UserProfileHoverCard username={post.author.username} userId={post.author.id}>
              <Link to={`/u/${post.author.username}`} className="font-semibold mr-2 hover:underline">
                {post.author.username}
              </Link>
            </UserProfileHoverCard>
            {post.caption}
          </p>
        )}

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                to={`/explore?tag=${tag}`}
                className="text-xs text-accent hover:underline"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Comment preview — shows top comment for curiosity */}
        {post.comment_count > 0 && (
          <button onClick={() => setShowCommentSheet(true)} className="text-sm text-muted-foreground hover:text-foreground transition-colors text-left">
            View all {post.comment_count} comments
          </button>
        )}
      </div>

      {/* Edit Post Dialog */}
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

      {/* Comment Sheet */}
      <CommentSheet
        postId={post.id}
        authorId={post.author.id}
        commentCount={post.comment_count}
        isOpen={showCommentSheet}
        onClose={() => setShowCommentSheet(false)}
      />
    </motion.article>
  );
});