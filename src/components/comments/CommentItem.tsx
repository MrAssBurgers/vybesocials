import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Flag, MoreHorizontal, EyeOff, Eye } from 'lucide-react';
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
import { useSafetySettings } from '@/hooks/useSafetySettings';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { StyledUsername } from '@/components/ui/StyledUsername';

interface CommentItemProps {
  comment: {
    id: string;
    text: string;
    image_url: string | null;
    created_at: string;
    is_flagged?: boolean;
    safety_score?: number;
    user: {
      id: string;
      username: string;
      avatar_url: string | null;
    };
  };
  postId: string;
}

function CommentDropdownMenu({ isOwn, onDelete, onReport, isDeleting }: {
  isOwn: boolean;
  onDelete: () => void;
  onReport: () => void;
  isDeleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className={cn(
            "h-7 w-7 flex-shrink-0",
            open ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="end" 
        side="bottom"
        sideOffset={4}
        collisionPadding={8}
        avoidCollisions={false}
      >
        {isOwn ? (
          <DropdownMenuItem 
            onClick={onDelete}
            className="text-destructive"
            disabled={isDeleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={onReport}>
            <Flag className="h-4 w-4 mr-2" />
            Report
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const CommentItem = memo(function CommentItem({ comment, postId }: CommentItemProps) {
  const { profile } = useAuth();
  const deleteComment = useDeleteComment();
  const { data: safetySettings } = useSafetySettings();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isOwn = profile?.id === comment.user.id;
  const isGif = comment.image_url?.includes('giphy.com') || comment.image_url?.includes('tenor.com');

  // Safety tier logic
  const filterLevel = safetySettings?.content_filter_level || 'moderate';
  const isFlagged = comment.is_flagged || (comment.safety_score && comment.safety_score > 0.5);

  // Protected: hide flagged comments entirely
  if (isFlagged && filterLevel === 'protected' && !isOwn) {
    return null;
  }

  const isBlurred = isFlagged && filterLevel === 'moderate' && !isOwn && !revealed;

  const handleDelete = () => {
    deleteComment.mutate({ commentId: comment.id, postId });
  };

  const handleReport = async () => {
    if (!profile) return;
    toast.success('Comment reported. We will review it shortly.');
  };

  const hasText = comment.text && comment.text.trim().length > 0;
  const hasMedia = comment.image_url && !imageError;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-3 group bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10"
    >
      <Link to={`/u/${comment.user.username}`}>
        <Avatar className="h-8 w-8 flex-shrink-0">
          <AvatarImage src={comment.user.avatar_url || undefined} />
          <AvatarFallback>{comment.user.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0 relative">
            <div className={cn(
              "transition-all",
              isBlurred && "blur-md select-none pointer-events-none"
            )}>
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
                  <span className="text-sm break-words text-foreground">{comment.text}</span>
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
            </div>

            {/* Blur overlay */}
            {isBlurred && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRevealed(true)}
                  className="gap-1.5 text-xs"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Sensitive — tap to view
                </Button>
              </div>
            )}

            {isFlagged && revealed && filterLevel === 'moderate' && !isOwn && (
              <button
                onClick={() => setRevealed(false)}
                className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
              >
                <Eye className="h-3 w-3" />
                Hide again
              </button>
            )}

            {!isBlurred && (
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                </span>
              </div>
            )}
          </div>

          {!isBlurred && (
            <CommentDropdownMenu
              isOwn={isOwn}
              onDelete={handleDelete}
              onReport={handleReport}
              isDeleting={deleteComment.isPending}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
});
