import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, MoreVertical, Trash2, Flag, Eye, Pencil } from 'lucide-react';
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
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ModBadge } from '@/components/ui/ModBadge';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { EditPostDialog } from '@/components/posts/EditPostDialog';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { ShareSheet } from '@/components/share/ShareSheet';

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
    } | null;
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
export const ShortCard = memo(function ShortCard({ post, isActive, globalMuted = true, onToggleMute, isHolding: externalIsHolding = false }: ShortCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const { data: authorRole } = useUserRoleById(post.author?.id);
  const isModOrAdmin = useIsModOrAdmin();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isMuted, setIsMuted] = useState(globalMuted);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);
  const [showLikeParticles, setShowLikeParticles] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const hasCountedInitialView = useRef(false);
  const lastTapTime = useRef(0);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasHoldingRef = useRef(false); // Track if we just released from a hold
  const holdStartedRef = useRef(false); // Track if hold gesture started
  
  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author?.avatar_url || null);
  
  // Combine external and internal holding state
  const effectiveIsHolding = externalIsHolding || isHolding;
  const { isSlowConnection } = useNetworkStatus();

  // Subscribe to realtime view count updates
  useEffect(() => {
    const channel = supabase
      .channel(`post-views-${post.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'posts',
          filter: `id=eq.${post.id}`,
        },
        (payload) => {
          if (payload.new && typeof payload.new.view_count === 'number') {
            setViewCount(payload.new.view_count);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [post.id]);

  // Sync with global mute state
  useEffect(() => {
    setIsMuted(globalMuted);
    if (videoRef.current) {
      videoRef.current.muted = globalMuted;
    }
  }, [globalMuted]);

  // Track if initial autoplay happened
  const hasInitializedRef = useRef(false);

  // Handle hold pause - DO NOT touch mute state here
  useEffect(() => {
    if (videoRef.current) {
      if (effectiveIsHolding) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else if (isActive) {
        // Resume playback without changing mute state
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
      }
    }
  }, [effectiveIsHolding, isActive]);

  // Auto-play when active - mute state only changes via tap
  useEffect(() => {
    if (videoRef.current && signedMediaUrl) {
      // Skip if holding - that's handled separately
      if (effectiveIsHolding) return;

      if (isActive) {
        // Only set mute on FIRST ever autoplay for this clip
        if (!hasInitializedRef.current) {
          videoRef.current.muted = isMuted;
          hasInitializedRef.current = true;
        }
        // Otherwise don't touch video.muted - preserve current state
        
        videoRef.current.play().then(() => {
          setIsPlaying(true);
          // Count initial view
          if (!hasCountedInitialView.current && profile) {
            hasCountedInitialView.current = true;
            incrementViewCount();
          }
        }).catch(() => {
          // Browser blocked autoplay - force muted and retry
          if (videoRef.current) {
            videoRef.current.muted = true;
            setIsMuted(true);
            videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
          }
        });
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        hasCountedInitialView.current = false;
        hasInitializedRef.current = false;
        setIsPlaying(false);
      }
    }
  }, [isActive, signedMediaUrl, isMuted, profile]);

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

  // Tap to toggle mute (single tap), double tap to like
  // CRITICAL: Only works when playing, NOT when coming from a hold
  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    // CRITICAL: If we just released from a hold, ignore this click entirely
    // This prevents hold-release from triggering mute toggle
    if (wasHoldingRef.current || isHolding || holdStartedRef.current) {
      return;
    }
    
    // CRITICAL: Only allow mute toggle when video is actively playing
    // Do NOT toggle mute while paused
    if (!isPlaying) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    if (timeSinceLastTap < 300) {
      // Double tap - like
      handleDoubleTap();
    } else {
      // Single tap - toggle mute ONLY
      if (onToggleMute) {
        onToggleMute();
      } else if (videoRef.current) {
        videoRef.current.muted = !isMuted;
        setIsMuted(!isMuted);
      }
    }
    lastTapTime.current = now;
  }, [isMuted, onToggleMute, isHolding, isPlaying]);
  
  // Guard against null author - return early with placeholder AFTER all hooks
  if (!post.author) {
    return (
      <div className="relative h-full w-full bg-black flex items-center justify-center">
        <p className="text-white/50">Post unavailable</p>
      </div>
    );
  }

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

  const handleLike = async () => {
    if (!profile || !post.author) return;

    const newIsLiked = !isLiked;
    const prevIsLiked = isLiked;
    const prevLikeCount = likeCount;
    
    // Optimistic update
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      setShowLikeParticles(true);
      setTimeout(() => setShowLikeParticles(false), 700);
    }

    try {
      if (newIsLiked) {
        const { error } = await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id });
        if (error) throw error;
        
        if (post.author.id !== profile.id) {
          await supabase.from('notifications').insert({
            user_id: post.author.id,
            type: 'like',
            actor_id: profile.id,
            post_id: post.id,
          });
        }
      } else {
        const { error } = await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id });
        if (error) throw error;
      }
      // Invalidate to sync with server
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } catch (error) {
      // Revert on error
      console.error('Like failed:', error);
      setIsLiked(prevIsLiked);
      setLikeCount(prevLikeCount);
      toast.error('Failed to update like');
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

  const handleShare = () => setShowShareSheet(true);
  
  const handleOpenComments = () => {
    if (videoRef.current) { videoRef.current.pause(); setIsPlaying(false); }
    setShowCommentSheet(true);
  };
  
  const handleCloseComments = () => {
    setShowCommentSheet(false);
    if (videoRef.current && isActive) { videoRef.current.play().catch(() => {}); setIsPlaying(true); }
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleTouchStart}
        onMouseUp={handleTouchEnd}
        onMouseLeave={handleTouchEnd}
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
            webkit-playsinline="true"
            muted={isMuted}
            preload={isActive ? "metadata" : "none"}
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
        {isVideo && isMuted && isPlaying && !effectiveIsHolding && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
            <div className="w-20 h-20 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center animate-pulse">
              <VolumeX className="h-10 w-10 text-white/90" />
            </div>
          </div>
        )}

        {/* Play indicator when paused (but NOT when holding - no UI for hold-pause) */}
        <AnimatePresence>
          {isVideo && !isPlaying && !isLoading && !hasError && !effectiveIsHolding && (
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

        {/* Double tap heart - fun burst effect */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
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

        {/* Comment - opens bottom sheet */}
        <button onClick={handleOpenComments}>
          <motion.button 
            whileTap={{ scale: 0.7 }}
            className="flex flex-col items-center gap-1"
          >
            <MessageCircle className="h-8 w-8 text-white drop-shadow-lg" />
            <span className="text-xs font-bold text-white drop-shadow-lg">{post.comment_count}</span>
          </motion.button>
        </button>

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
            {/* Show author's mod badge in menu header */}
            {authorRole && (
              <div className="px-2 py-1.5 flex items-center gap-2 border-b border-border/50 mb-1">
                <ModBadge role={authorRole} showLabel />
              </div>
            )}
            {isOwnPost && (
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Clip
              </DropdownMenuItem>
            )}
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
            {/* Mod actions - only visible to mods/admins and not on own content */}
            {isModOrAdmin && !isOwnPost && post.author && (
              <ModeratorMenuItems
                userId={post.author.id}
                username={post.author.username}
                postId={post.id}
                onWarnClick={() => setWarnDialogOpen(true)}
                onBanClick={() => setBanDialogOpen(true)}
                onMemeBanClick={() => setMemeBanDialogOpen(true)}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        
        {/* Edit dialog */}
        <EditPostDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          post={{ id: post.id, caption: post.caption, tags: post.tags || [] }}
        />
        
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
        />
      </div>

      <div className="absolute left-4 right-20 bottom-4 z-10">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Link to={`/u/${post.author.username}`} className="flex items-center gap-2">
            <Avatar className="h-6 w-6 border border-white/50">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="bg-primary text-white text-xs font-bold">
                {post.author.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-bold text-lg text-white drop-shadow-lg">
              @{post.author.username}
            </span>
          </Link>
          {authorRole && <ModBadge role={authorRole} className="shadow-md" />}
          {isOwner(post.author.username) && <OwnerBadge />}
          {isOwnerWife(post.author.id) && <OwnerWifeRingBadge />}
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

      {/* Comment Sheet */}
      <CommentSheet
        postId={post.id}
        authorId={post.author?.id || ''}
        commentCount={post.comment_count}
        isOpen={showCommentSheet}
        onClose={handleCloseComments}
      />

      {/* Share Sheet */}
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
