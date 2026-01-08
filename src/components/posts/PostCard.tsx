import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Pencil, Trash2, Pin, PinOff, Flag } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EditPostDialog } from './EditPostDialog';
import { OwnerBadge, isOwner } from '@/components/ui/OwnerBadge';
import { useTogglePin } from '@/hooks/usePosts';
import { useUserRole } from '@/hooks/useModeration';
import { useSignedUrl } from '@/hooks/useSignedUrl';

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

export function PostCard({ post }: PostCardProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const togglePin = useTogglePin();
  const { data: userRole } = useUserRole();
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [likeCount, setLikeCount] = useState(post.like_count);
  const [isBookmarked, setIsBookmarked] = useState(post.is_bookmarked);
  const [showHeart, setShowHeart] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const signedMediaUrl = useSignedUrl(post.media_url);
  const signedAvatarUrl = useSignedUrl(post.author.avatar_url);

  const isOwnPost = profile?.id === post.author.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

  const handleReport = async () => {
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
  };

  const handleTogglePin = () => {
    togglePin.mutate({ postId: post.id, isPinned: !post.is_pinned });
  };

  const handleLike = async () => {
    if (!profile) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id });
      // Create notification
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
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-xl overflow-hidden border border-border"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Media */}
      <div 
        className="relative aspect-square bg-muted cursor-pointer"
        onDoubleClick={handleDoubleTap}
      >
        {post.type === 'video' ? (
          <video
            src={signedMediaUrl || ''}
            className="w-full h-full object-cover"
            controls
            playsInline
          />
        ) : (
          <img
            src={signedMediaUrl || ''}
            alt={post.caption}
            className="w-full h-full object-cover"
          />
        )}
        
        {/* Double tap heart animation */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart className="h-24 w-24 text-primary fill-primary drop-shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={handleLike} className="group">
              <motion.div animate={isLiked ? { scale: [1, 1.3, 1] } : {}}>
                <Heart
                  className={cn(
                    "h-6 w-6 transition-colors",
                    isLiked ? "fill-primary text-primary" : "text-foreground group-hover:text-primary"
                  )}
                />
              </motion.div>
            </button>
            <Link to={`/p/${post.id}`}>
              <MessageCircle className="h-6 w-6 hover:text-primary transition-colors" />
            </Link>
            <button onClick={handleShare}>
              <Share2 className="h-6 w-6 hover:text-primary transition-colors" />
            </button>
          </div>
          <button onClick={handleBookmark}>
            <Bookmark
              className={cn(
                "h-6 w-6 transition-colors",
                isBookmarked ? "fill-foreground text-foreground" : "hover:text-primary"
              )}
            />
          </button>
        </div>

        {/* Likes */}
        <p className="font-semibold text-sm">{likeCount.toLocaleString()} likes</p>

        {/* Caption */}
        {post.caption && (
          <p className="text-sm">
            <Link to={`/u/${post.author.username}`} className="font-semibold mr-2">
              {post.author.username}
            </Link>
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
      <EditPostDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        post={{ id: post.id, caption: post.caption, tags: post.tags }}
      />
    </motion.article>
  );
}
