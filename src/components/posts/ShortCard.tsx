import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, Volume2, VolumeX, Play, MoreVertical, Trash2, Flag } from 'lucide-react';
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
  };
  isActive: boolean;
}

export function ShortCard({ post, isActive }: ShortCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);

  useEffect(() => {
    if (videoRef.current) {
      if (isActive) {
        videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
      } else {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        setIsPlaying(false);
      }
    }
  }, [isActive]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

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
      await navigator.share({ title: 'Check this out on LOLLoop', url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this short?')) return;

    try {
      const { error } = await supabase
        .from('posts')
        .delete()
        .eq('id', post.id);

      if (error) throw error;

      toast.success('Short deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['shorts'] });
    } catch (error) {
      console.error('Failed to delete short:', error);
      toast.error('Failed to delete short');
    }
  };

  const handleReport = async () => {
    if (!profile) return;
    const reason = prompt('Why are you reporting this short?');
    if (!reason) return;

    try {
      await supabase.from('reports').insert({
        reporter_id: profile.id,
        post_id: post.id,
        reason,
      });
      toast.success('Short reported. We will review it shortly.');
    } catch (error) {
      toast.error('Failed to report short');
    }
  };

  const isVideo = post.media_url.includes('.mp4') || post.media_url.includes('.webm') || post.media_url.includes('.mov');

  return (
    <div className="relative h-full w-full bg-background flex items-center justify-center">
      {/* Media */}
      <div 
        className="absolute inset-0 flex items-center justify-center"
        onClick={isVideo ? togglePlay : undefined}
        onDoubleClick={handleDoubleTap}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            src={signedMediaUrl || ''}
            className="h-full w-full object-contain"
            loop
            playsInline
            muted={isMuted}
          />
        ) : (
          <img
            src={signedMediaUrl || ''}
            alt={post.caption}
            className="h-full w-full object-contain"
          />
        )}

        {/* Play indicator */}
        <AnimatePresence>
          {isVideo && !isPlaying && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-background/20"
            >
              <Play className="h-16 w-16 text-foreground" />
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
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="h-32 w-32 text-primary fill-primary drop-shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent pointer-events-none" />

      {/* Right side actions */}
      <div className="absolute right-4 bottom-32 flex flex-col items-center gap-6">
        {/* Author avatar */}
        <Link to={`/u/${post.author.username}`} className="relative">
          <div className="story-ring">
            <Avatar className="h-12 w-12 border-2 border-background">
              <AvatarImage src={signedAvatarUrl || undefined} />
              <AvatarFallback className="bg-secondary text-secondary-foreground">
                {post.author.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
        </Link>

        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <motion.div animate={isLiked ? { scale: [1, 1.3, 1] } : {}}>
            <Heart
              className={cn(
                "h-8 w-8",
                isLiked ? "fill-primary text-primary" : "text-foreground"
              )}
            />
          </motion.div>
          <span className="text-xs font-semibold">{likeCount}</span>
        </button>

        {/* Comment */}
        <Link to={`/p/${post.id}`} className="flex flex-col items-center gap-1">
          <MessageCircle className="h-8 w-8" />
          <span className="text-xs font-semibold">{post.comment_count}</span>
        </Link>

        {/* Bookmark */}
        <button onClick={handleBookmark} className="flex flex-col items-center gap-1">
          <Bookmark
            className={cn(
              "h-8 w-8",
              isBookmarked ? "fill-foreground" : ""
            )}
          />
        </button>

        {/* Share */}
        <button onClick={handleShare} className="flex flex-col items-center gap-1">
          <Share2 className="h-8 w-8" />
        </button>

        {/* Mute toggle for video */}
        {isVideo && (
          <button onClick={() => setIsMuted(!isMuted)} className="flex flex-col items-center gap-1">
            {isMuted ? <VolumeX className="h-8 w-8" /> : <Volume2 className="h-8 w-8" />}
          </button>
        )}

        {/* More options menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-foreground hover:bg-foreground/10">
              <MoreVertical className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canDelete && (
              <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Short
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
      <div className="absolute left-4 right-20 bottom-8">
        <Link to={`/u/${post.author.username}`} className="font-bold text-lg">
          @{post.author.username}
        </Link>
        {post.caption && (
          <p className="text-sm mt-1 line-clamp-2">{post.caption}</p>
        )}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {post.tags.map((tag) => (
              <span key={tag} className="text-xs text-accent">#{tag}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
