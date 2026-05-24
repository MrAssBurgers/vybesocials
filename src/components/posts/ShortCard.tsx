import { useState, useRef, useEffect, useCallback, memo } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Send as SendIcon, Bookmark, Volume2, VolumeX, Play, MoreVertical, Trash2, Flag, Eye, Pencil } from 'lucide-react';
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
import { useUserRole } from '@/hooks/useModeration';
import { useUserRoleById } from '@/hooks/useUserRoleById';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { ModBadge } from '@/components/ui/ModBadge';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { OwnerWifeRingBadge, isOwnerWife } from '@/components/ui/OwnerWifeRingBadge';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { PremiumMemeBanMenuItem, PremiumMemeBanDialog } from '@/components/premium/PremiumMemeBanItems';
import { EditPostDialog } from '@/components/posts/EditPostDialog';
import { CommentSheet } from '@/components/comments/CommentSheet';
import { ShareSheet } from '@/components/share/ShareSheet';
import { HoldToShare } from '@/components/share/HoldToShare';

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
  const [currentReaction, setCurrentReaction] = useState<ReactionType | null>(
    post.is_liked ? ((post as any).reaction_type as ReactionType || 'like') : null
  );
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);
  const [showLikeParticles, setShowLikeParticles] = useState(false);
  const [viewCount, setViewCount] = useState(post.view_count || 0);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  const [premiumMemeBanOpen, setPremiumMemeBanOpen] = useState(false);
  const [deleteContentDialog, setDeleteContentDialog] = useState<{ type: 'post' | 'comment' | 'listing'; id: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [showCommentSheet, setShowCommentSheet] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const hasCountedInitialView = useRef(false);
  const lastTapTime = useRef(0);
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wasHoldingRef = useRef(false);
  const holdStartedRef = useRef(false);
  
  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author?.avatar_url || null);
  
  const effectiveIsHolding = externalIsHolding || isHolding;
  const { isSlowConnection } = useNetworkStatus();

  // Sync view count from props (no realtime subscription needed)
  useEffect(() => {
    setViewCount(post.view_count || 0);
  }, [post.view_count]);

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
        videoRef.current.play().then(() => {
          setIsPlaying(true);
        }).catch(() => {});
      }
    }
  }, [effectiveIsHolding, isActive]);

  // Auto-play when active - mute state only changes via tap
  useEffect(() => {
    if (videoRef.current && signedMediaUrl) {
      if (effectiveIsHolding) return;

      if (isActive) {
        if (!hasInitializedRef.current) {
          videoRef.current.muted = isMuted;
          hasInitializedRef.current = true;
        }
        
        videoRef.current.play().then(() => {
          setIsPlaying(true);
          if (!hasCountedInitialView.current && profile) {
            hasCountedInitialView.current = true;
            incrementViewCount();
          }
        }).catch(() => {
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
        setViewCount(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to increment view count:', error);
      setViewCount(prev => prev + 1);
    }
  };

  const handleVideoEnded = useCallback(() => {
    if (profile && isActive) {
      incrementViewCount();
    }
  }, [profile, isActive]);

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
      setTimeout(() => {
        wasHoldingRef.current = false;
      }, 50);
    }
  }, [isHolding]);

  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (wasHoldingRef.current || isHolding || holdStartedRef.current) {
      return;
    }
    
    if (!isPlaying) return;
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime.current;
    
    if (timeSinceLastTap < 300) {
      // Double tap detected — cancel pending single tap mute and trigger like
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      handleDoubleTap();
    } else {
      // Delay single tap action to check if a double tap follows
      singleTapTimer.current = setTimeout(() => {
        if (onToggleMute) {
          onToggleMute();
        } else if (videoRef.current) {
          videoRef.current.muted = !isMuted;
          setIsMuted(!isMuted);
        }
        singleTapTimer.current = null;
      }, 300);
    }
    lastTapTime.current = now;
  }, [isMuted, onToggleMute, isHolding, isPlaying]);
  
  if (!post.author) {
    return (
      <div className="relative h-full w-full bg-black flex items-center justify-center">
        <p className="text-white/50">Post unavailable</p>
      </div>
    );
  }

  if (isHidden) return null;

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  // Only the author sees the personal "Delete" item. Mods use Mod Actions →
  // "Delete Post (Mod)" so they never see two delete buttons on the same clip.
  const canDelete = isOwnPost;

  const handleReaction = async (reactionType: ReactionType | null) => {
    if (!profile || !post.author) return;

    const wasLiked = currentReaction !== null;
    const newIsLiked = reactionType !== null;
    const prevReaction = currentReaction;
    const prevLikeCount = likeCount;
    
    setCurrentReaction(reactionType);
    setIsLiked(newIsLiked);
    setLikeCount(prev => {
      if (wasLiked && !newIsLiked) return prev - 1;
      if (!wasLiked && newIsLiked) return prev + 1;
      return prev;
    });

    if (newIsLiked && !wasLiked) {
      setShowLikeParticles(true);
      setTimeout(() => setShowLikeParticles(false), 700);
    }

    try {
      if (newIsLiked) {
        const { error } = await supabase.from('likes').upsert(
          { user_id: profile.id, post_id: post.id, reaction_type: reactionType } as any,
          { onConflict: 'user_id,post_id', ignoreDuplicates: false }
        );
        if (error) throw error;
        
        if (!wasLiked && post.author.id !== profile.id) {
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
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    } catch (error) {
      console.error('Reaction failed:', error);
      setCurrentReaction(prevReaction);
      setIsLiked(wasLiked);
      setLikeCount(prevLikeCount);
      toast.error('Failed to update reaction');
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
    if (!currentReaction) {
      handleReaction('like');
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this clip?')) return;

    try {
      const { data: deletedRows, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id)
        .select('id');

      if (error) throw error;

      if (!deletedRows || deletedRows.length === 0) {
        toast.error("You don't have permission to delete this clip");
        return;
      }

      if (profile?.id) {
        supabase.from('post_deletion_log').insert({
          post_id: post.id,
          author_id: (post as any).author?.id ?? null,
          deleted_by: profile.id,
          post_type: (post as any).type ?? 'short',
          caption: post.caption ?? null,
          reason: 'user_self_delete',
        }).then(({ error: logErr }) => {
          if (logErr) console.warn('[DeletionLog] insert failed', logErr);
        });
      }

      toast.success('Clip deleted');
      setIsHidden(true);
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

    const { error } = await supabase.from('reports').insert({
      reporter_id: profile.id,
      reported_user_id: (post as any).author?.id ?? null,
      post_id: post.id,
      reason,
    });
    if (error) {
      console.error('[Report] insert failed', error);
      toast.error(`Failed to report clip: ${error.message}`);
      return;
    }
    toast.success('Clip reported. We will review it shortly.');
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
        className="absolute inset-0 flex items-center justify-center touch-pan-y"
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

        {/* Play indicator when paused */}
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

        {/* Double tap heart */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ duration: 0.4, type: 'spring', stiffness: 400, damping: 15 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <motion.div
                animate={{ 
                  scale: [0, 1.5, 0.85, 1.15, 1],
                  rotate: [0, -20, 20, -8, 0]
                }}
                transition={{ duration: 0.6, type: 'spring', stiffness: 300 }}
              >
                <Heart className="h-36 w-36 text-rose-500 fill-rose-500 drop-shadow-2xl" />
              </motion.div>
              
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

      {/* Bottom gradient */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/40 to-transparent pointer-events-none" />

      {/* Right side actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        {/* Author avatar */}
        <Link to={`/u/${post.author.username}`}>
          <Avatar className="h-12 w-12 border-2 border-white shadow-lg">
            <AvatarImage src={signedAvatarUrl || undefined} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {post.author.username[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>

        {/* Like - Reaction Picker */}
        <div className="flex flex-col items-center gap-1">
          <ReactionPicker
            currentReaction={currentReaction}
            onReact={handleReaction}
            likeCount={likeCount}
            compact
          />
          <span className="text-xs font-semibold text-white drop-shadow-lg">{likeCount}</span>
        </div>

        {/* Comment */}
        <button onClick={handleOpenComments} className="flex flex-col items-center gap-1">
          <MessageCircle className="h-8 w-8 text-white drop-shadow-lg" />
          <span className="text-xs font-semibold text-white drop-shadow-lg">{post.comment_count}</span>
        </button>

        {/* Share */}
        <HoldToShare postId={post.id} postType="short" mediaUrl={post.media_url}>
          <button onClick={handleShare} className="flex flex-col items-center gap-1">
            <SendIcon className="h-7 w-7 text-white drop-shadow-lg" />
          </button>
        </HoldToShare>

        {/* Bookmark */}
        <button onClick={handleBookmark} className="flex flex-col items-center gap-1">
          <Bookmark
            className={cn(
              "h-7 w-7 drop-shadow-lg",
              isBookmarked ? "fill-white text-white" : "text-white"
            )}
          />
        </button>

        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex flex-col items-center">
              <MoreVertical className="h-7 w-7 text-white drop-shadow-lg" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {isOwnPost && (
              <DropdownMenuItem onClick={() => setEditDialogOpen(true)}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {canDelete && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            )}
            {!isOwnPost && (
              <DropdownMenuItem onClick={handleReport}>
                <Flag className="mr-2 h-4 w-4" />
                Report
              </DropdownMenuItem>
            )}
            {isModOrAdmin && !isOwnPost && post.author && (
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
            {!isOwnPost && post.author && (
              <PremiumMemeBanMenuItem
                userId={post.author.id}
                username={post.author.username}
                onOpen={() => setPremiumMemeBanOpen(true)}
              />
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-6 left-4 right-16 z-10">
        <Link to={`/u/${post.author.username}`} className="flex items-center gap-2 mb-2">
          <span className="font-bold text-white text-sm drop-shadow-lg flex items-center gap-1">
            @{post.author.username}
            {isOwner(post.author.id) && <OwnerBadge />}
            {isOwnerWife(post.author.id) && <OwnerWifeRingBadge />}
            {authorRole === 'moderator' && <ModBadge role="moderator" />}
          </span>
        </Link>
        {post.caption && (
          <p className="text-white/90 text-sm line-clamp-2 drop-shadow-lg">{post.caption}</p>
        )}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {post.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs text-white/70 drop-shadow-lg">#{tag}</span>
            ))}
          </div>
        )}
        {/* View count */}
        <div className="flex items-center gap-1 mt-1">
          <Eye className="h-3.5 w-3.5 text-white/60" />
          <span className="text-xs text-white/60">{formatViewCount(viewCount)} views</span>
        </div>
      </div>

      {/* Mute indicator */}
      {isVideo && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleMute) {
              onToggleMute();
            } else if (videoRef.current) {
              videoRef.current.muted = !isMuted;
              setIsMuted(!isMuted);
            }
          }}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 backdrop-blur-sm"
        >
          {isMuted ? (
            <VolumeX className="h-5 w-5 text-white" />
          ) : (
            <Volume2 className="h-5 w-5 text-white" />
          )}
        </button>
      )}

      {/* Comment Sheet */}
      <CommentSheet
        postId={post.id}
        authorId={post.author.id}
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
        mediaUrl={post.media_url}
      />

      {/* Edit Dialog */}
      {isOwnPost && (
        <EditPostDialog
          post={post}
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
        />
      )}

      {/* Moderator Dialogs */}
      {isModOrAdmin && post.author && (
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
      )}
      {post.author && (
        <PremiumMemeBanDialog
          userId={post.author.id}
          username={post.author.username}
          open={premiumMemeBanOpen}
          onOpenChange={setPremiumMemeBanOpen}
        />
      )}
    </div>
  );
});
