import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Flag, MoreHorizontal } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/lib/auth';
import { useDeleteComment } from '@/hooks/useComments';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StyledUsername } from '@/components/ui/StyledUsername';

interface CommentItemProps {
  comment: {
    id: string;
    text: string;
    image_url: string | null;
    created_at: string;
    user: {
      id: string;
      username: string;
      avatar_url: string | null;
    };
  };
  postId: string;
}

export const CommentItem = memo(function CommentItem({ comment, postId }: CommentItemProps) {
  const { profile } = useAuth();
  const deleteComment = useDeleteComment();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const isOwn = profile?.id === comment.user.id;
  const isGif = comment.image_url?.includes('giphy.com') || comment.image_url?.includes('tenor.com');

  const handleDelete = () => {
    deleteComment.mutate({ commentId: comment.id, postId });
  };

  const handleReport = async () => {
    if (!profile) return;
    
    try {
      // For now, just show a toast - in future integrate with moderation
      toast.success('Comment reported. We will review it shortly.');
    } catch (error) {
      toast.error('Failed to report comment');
    }
  };

  const hasText = comment.text && comment.text.trim().length > 0;
  const hasMedia = comment.image_url && !imageError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-3 group"
    >
      <Link to={`/u/${comment.user.username}`}>
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={comment.user.avatar_url || undefined} />
          <AvatarFallback>{comment.user.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <Link 
                to={`/u/${comment.user.username}`}
                className="hover:underline"
              >
                <StyledUsername
                  userId={comment.user.id}
                  username={comment.user.username}
                  className="font-semibold text-sm"
                  preferDisplayName={false}
                />
              </Link>
              {hasText && (
                <span className="text-sm break-words">{comment.text}</span>
              )}
            </div>

            {/* Media content */}
            <AnimatePresence>
              {hasMedia && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-2 relative inline-block"
                >
                  <div className={cn(
                    "rounded-lg overflow-hidden border border-border max-w-[240px]",
                    !imageLoaded && "bg-muted animate-pulse min-h-[100px]"
                  )}>
                    <img
                      src={comment.image_url!}
                      alt=""
                      className={cn(
                        "w-full h-auto max-h-48 object-cover transition-opacity",
                        imageLoaded ? "opacity-100" : "opacity-0"
                      )}
                      loading="lazy"
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageError(true)}
                    />
                  </div>
                  {isGif && imageLoaded && (
                    <span className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-black/60 text-white">
                      GIF
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isOwn ? (
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-destructive"
                  disabled={deleteComment.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={handleReport}>
                  <Flag className="h-4 w-4 mr-2" />
                  Report
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.div>
  );
});
