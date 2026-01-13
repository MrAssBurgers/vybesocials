import { useState, useRef, memo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Pencil, Trash2, Pin, PinOff, Flag, Volume2, VolumeX, Play, ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EditPostDialog } from './EditPostDialog';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { PrincessBadge, isOwnerWife } from '@/components/ui/PrincessBadge';
import { useTogglePin } from '@/hooks/usePosts';
import { useUserRole } from '@/hooks/useModeration';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';

// Video player component - shows thumbnail until clicked (like YouTube Shorts)
function VideoPlayer({ src, caption }: { src: string; caption?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Early return for invalid source
  if (!isValidMediaUrl(src)) {
    return <MediaFallback type="video" caption={caption} />;
  }

  const handleLoadedData = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      if (duration > 0) {
        const randomTime = Math.random() * Math.min(duration, 10);
        videoRef.current.currentTime = randomTime;
      }
      setIsLoaded(true);
      setHasError(false);
    }
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

  if (hasError) {
    return <MediaFallback type="video" caption={caption} />;
  }

  return (
    <div 
      className="relative w-full h-full cursor-pointer bg-muted" 
      onClick={handleClick}
    >
      {/* Loading skeleton */}
      {!isLoaded && <MediaSkeleton />}
      <video
        ref={videoRef}
        src={src}
        className={cn("w-full h-full object-cover transition-opacity", isLoaded ? "opacity-100" : "opacity-0")}
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onLoadedData={handleLoadedData}
        onError={handleError}
      />
      {/* Play indicator when not playing */}
      {!isPlaying && isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Play className="h-16 w-16 text-white/90 fill-white/90" />
          </motion.div>
        </div>
      )}
      {/* Mute/Unmute button when playing */}
      {isPlaying && !hasError && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={toggleMute}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-black/50 text-white"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </motion.button>
      )}
    </div>
  );
}

// Natural aspect ratio image component - NO black padding, natural sizing
function NaturalAspectImage({ src, caption }: { src: string; caption?: string }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  if (!isValidMediaUrl(src)) {
    return <MediaFallback type="image" caption={caption} className="aspect-square" />;
  }

  if (hasError) {
    return <MediaFallback type="image" caption={caption} className="aspect-square" />;
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setIsLoaded(true);
  };

  // Calculate aspect ratio and determine max height constraint
  const aspectRatio = dimensions ? dimensions.width / dimensions.height : 1;
  
  // Very tall images get limited, very wide images just flow naturally
  const isTall = aspectRatio < 0.6;
  const isWide = aspectRatio > 1.5;

  return (
    <div className="relative w-full flex items-center justify-center bg-transparent">
      {/* Skeleton placeholder - maintains space while loading */}
      {!isLoaded && (
        <div className="w-full aspect-square">
          <MediaSkeleton className="absolute inset-0" />
        </div>
      )}
      <img
        src={src}
        alt={caption || ''}
        className={cn(
          "w-full h-auto transition-opacity duration-200",
          // Tall images: limit height to prevent excessive scrolling
          isTall && "max-h-[70vh] w-auto object-contain",
          // Wide/landscape images: full width, natural height
          isWide && "w-full h-auto",
          // Normal images: just display naturally
          !isTall && !isWide && "w-full h-auto",
          isLoaded ? "opacity-100" : "opacity-0"
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
    caption: string;
    tags: string[];
    created_at: string;
    author: {
      id: string;
      username: string;
      avatar_url: string | null;
    };
    like_count: number;
    comment_count: number;
    is_liked: boolean;
    is_bookmarked: boolean;
    is_pinned?: boolean;
  };
}

export const PostCard = memo(function PostCard({ post }: PostCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const togglePin = useTogglePin();
  const { data: userRole } = useUserRole();
  const isModOrAdmin = useIsModOrAdmin();
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);
  const [showLikeParticles, setShowLikeParticles] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);

  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

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

  const handleLike = useCallback(async () => {
    if (!profile) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    // Trigger particle burst on like
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
  }, [profile, isLiked, post.id, post.author.id]);

  const handleBookmark = useCallback(async () => {
    if (!profile) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    if (newIsBookmarked) {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
    } else {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
    }
  }, [profile, isBookmarked, post.id]);

  const handleDoubleTap = useCallback(() => {
    if (!isLiked) {
      handleLike();
    }
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 800);
  }, [isLiked, handleLike]);

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/p/${post.id}`;
    if (navigator.share) {
      await navigator.share({ title: 'Check this out on LOLLoop', url });
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
    <article className="liquid-glass-card rounded-2xl overflow-hidden">
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
                {post.author.username}
                {isOwner(post.author.username) && <OwnerBadge />}
                {isOwnerWife(post.author.id) && <PrincessBadge />}
                {post.is_pinned && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    <Pin className="h-3 w-3 mr-1" />
                    Pinned
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </Link>
        </UserProfileHoverCard>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
        />
      </div>

      {/* Media - natural aspect ratio, NO black padding */}
      <div 
        className="relative w-full cursor-pointer"
        onDoubleClick={handleDoubleTap}
      >
        {post.type === 'video' ? (
          <div className="aspect-[9/16] max-h-[70vh] bg-muted">
            <VideoPlayer src={signedMediaUrl || ''} caption={post.caption} />
          </div>
        ) : (
          <NaturalAspectImage src={signedMediaUrl || ''} caption={post.caption} />
        )}
        
        {/* Double tap heart animation - TikTok style */}
        <AnimatePresence>
          {showHeart && (
            <motion.div 
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 1], opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.5, type: 'spring', stiffness: 300 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="h-24 w-24 text-red-500 fill-red-500 drop-shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions - unified alignment */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between h-8">
          {/* Left action buttons - perfectly aligned */}
          <div className="flex items-center gap-1">
            {/* Like button with particles */}
            <div className="relative">
              <motion.button 
                whileTap={{ scale: 0.85 }}
                onClick={handleLike} 
                className="flex items-center justify-center h-8 w-8"
              >
                <motion.div
                  className="flex items-center justify-center"
                  animate={isLiked ? { 
                    scale: [1, 1.3, 0.9, 1.1, 1],
                    rotate: [0, -10, 10, -5, 0]
                  } : {}}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 400 }}
                >
                  <Heart
                    className={cn(
                      "h-6 w-6 transition-colors",
                      isLiked ? "fill-red-500 text-red-500" : "text-foreground hover:text-primary"
                    )}
                  />
                </motion.div>
              </motion.button>
              
              {/* Particle burst */}
              <AnimatePresence>
                {showLikeParticles && (
                  <div className="absolute inset-0 pointer-events-none">
                    {[...Array(6)].map((_, i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
                        animate={{ 
                          scale: [0, 1, 0.5],
                          x: Math.cos(i * 60 * Math.PI / 180) * 25,
                          y: Math.sin(i * 60 * Math.PI / 180) * 25,
                          opacity: [1, 1, 0],
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: i % 2 === 0 ? '#ef4444' : '#f97316' }}
                      />
                    ))}
                  </div>
                )}
              </AnimatePresence>
            </div>

            <Link to={`/p/${post.id}`} className="flex items-center justify-center h-8 w-8">
              <motion.div 
                whileTap={{ scale: 0.85 }} 
                className="flex items-center justify-center"
              >
                <MessageCircle className="h-6 w-6 hover:text-primary transition-colors" />
              </motion.div>
            </Link>
            
            <motion.button 
              whileTap={{ scale: 0.85 }}
              onClick={handleShare}
              className="flex items-center justify-center h-8 w-8"
            >
              <Share2 className="h-6 w-6 hover:text-primary transition-colors" />
            </motion.button>
          </div>
          
          {/* Bookmark button - right aligned */}
          <motion.button 
            whileTap={{ scale: 0.85 }}
            animate={isBookmarked ? { scale: [1, 1.3, 1] } : {}}
            onClick={handleBookmark}
            className="flex items-center justify-center h-8 w-8"
          >
            <Bookmark
              className={cn(
                "h-6 w-6 transition-colors",
                isBookmarked ? "fill-yellow-400 text-yellow-400" : "hover:text-primary"
              )}
            />
          </motion.button>
        </div>

        {/* Likes */}
        <p className="font-semibold text-sm">{likeCount.toLocaleString()} likes</p>

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

        {/* Comments preview */}
        {post.comment_count > 0 && (
          <Link to={`/p/${post.id}`} className="text-sm text-muted-foreground">
            View all {post.comment_count} comments
          </Link>
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
    </article>
  );
});