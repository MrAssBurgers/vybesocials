import { memo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, MoreHorizontal, Trash2, Flag, ChevronDown, ChevronUp, EyeOff, Eye } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useSafetySettings } from '@/hooks/useSafetySettings';

interface Comment {
  id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  like_count?: number;
  is_liked?: boolean;
  is_flagged?: boolean;
  safety_score?: number;
  safety_categories?: string[];
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  replies?: Comment[];
}

interface CommentThreadProps {
  comment: Comment;
  postId: string;
  onDelete?: (commentId: string) => void;
  onLike?: (commentId: string) => void;
  onReply?: (commentId: string, username: string) => void;
  onReport?: (commentId: string) => void;
  depth?: number;
}

export const CommentThread = memo(function CommentThread({
  comment,
  postId,
  onDelete,
  onLike,
  onReply,
  onReport,
  depth = 0,
}: CommentThreadProps) {
  const { profile } = useAuth();
  const { data: safetySettings } = useSafetySettings();
  const [showReplies, setShowReplies] = useState(depth === 0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [revealed, setRevealed] = useState(false);
  
  const signedAvatarUrl = useSignedUrl(comment.user.avatar_url);
  const isOwn = profile?.id === comment.user.id;
  const hasReplies = comment.replies && comment.replies.length > 0;
  const isGif = comment.image_url?.includes('giphy.com') || comment.image_url?.includes('tenor.com');
  const maxDepth = 2;

  // Safety tier logic
  const filterLevel = safetySettings?.content_filter_level || 'moderate';
  const isFlagged = comment.is_flagged || (comment.safety_score && comment.safety_score > 0.5);

  // Protected: hide flagged comments entirely
  if (isFlagged && filterLevel === 'protected' && !isOwn) {
    return null;
  }

  // Moderate: blur flagged comments, allow reveal
  const isBlurred = isFlagged && filterLevel === 'moderate' && !isOwn && !revealed;

  // Render @mentions as links
  const renderTextWithMentions = (text: string) => {
    const parts = text.split(/(@\w+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        const username = part.slice(1);
        return (
          <Link
            key={index}
            to={`/u/${username}`}
            className="text-primary hover:underline font-medium"
          >
            {part}
          </Link>
        );
      }
      return part;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "flex gap-3 group",
        depth > 0 && "ml-10 mt-3"
      )}
    >
      <Link to={`/u/${comment.user.username}`} className="flex-shrink-0">
        <Avatar className={cn("border border-border", depth === 0 ? "h-10 w-10" : "h-8 w-8")}>
          <AvatarImage src={signedAvatarUrl || undefined} />
          <AvatarFallback>{comment.user.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
      </Link>

      <div className="flex-1 min-w-0">
        {/* Comment content - with blur overlay for moderate users */}
        <div className="relative">
          <div className={cn(
            "bg-muted/50 rounded-2xl px-4 py-2 transition-all",
            isBlurred && "blur-md select-none pointer-events-none"
          )}>
            <Link 
              to={`/u/${comment.user.username}`}
              className="font-semibold text-sm hover:underline"
            >
              {comment.user.username}
            </Link>
            <p className="text-sm mt-0.5 break-words">
              {renderTextWithMentions(comment.text)}
            </p>
          </div>

          {/* Blur overlay with reveal button */}
          {isBlurred && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-muted/20 backdrop-blur-sm border border-border/50">
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

          {/* Revealed indicator */}
          {isFlagged && revealed && filterLevel === 'moderate' && !isOwn && (
            <button
              onClick={() => setRevealed(false)}
              className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              <Eye className="h-3 w-3" />
              Hide again
            </button>
          )}
        </div>

        {/* Media content */}
        <AnimatePresence>
          {comment.image_url && !isBlurred && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-2 relative inline-block"
            >
              <div className={cn(
                "rounded-lg overflow-hidden border border-border max-w-[200px]",
                !imageLoaded && "bg-muted animate-pulse min-h-[80px]"
              )}>
                <img
                  src={comment.image_url}
                  alt=""
                  className={cn(
                    "w-full h-auto max-h-40 object-cover transition-opacity",
                    imageLoaded ? "opacity-100" : "opacity-0"
                  )}
                  loading="lazy"
                  onLoad={() => setImageLoaded(true)}
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

        {/* Actions row */}
        {!isBlurred && (
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span>
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            
            {/* Like */}
            <button
              onClick={() => onLike?.(comment.id)}
              className={cn(
                "flex items-center gap-1 hover:text-foreground transition-colors",
                comment.is_liked && "text-red-500"
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", comment.is_liked && "fill-current")} />
              {(comment.like_count || 0) > 0 && <span>{comment.like_count}</span>}
            </button>

            {/* Reply button */}
            {depth < maxDepth && (
              <button
                onClick={() => onReply?.(comment.id, comment.user.username)}
                className="hover:text-foreground transition-colors font-medium"
              >
                Reply
              </button>
            )}

            {/* More options */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="h-6 w-6 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  onPointerDown={(e) => {
                    (e.currentTarget as any)._pointerY = e.clientY;
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const startY = (e.currentTarget as any)._pointerY;
                    if (startY !== undefined && Math.abs(e.clientY - startY) > 8) {
                      e.preventDefault();
                      return;
                    }
                  }}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isOwn ? (
                  <DropdownMenuItem 
                    onClick={() => onDelete?.(comment.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onReport?.(comment.id)}>
                    <Flag className="h-4 w-4 mr-2" />
                    Report
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Replies toggle */}
        {hasReplies && (
          <button
            onClick={() => setShowReplies(!showReplies)}
            className="flex items-center gap-1 mt-2 text-xs text-primary hover:underline"
          >
            {showReplies ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Hide replies
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                View {comment.replies!.length} {comment.replies!.length === 1 ? 'reply' : 'replies'}
              </>
            )}
          </button>
        )}

        {/* Nested replies */}
        <AnimatePresence>
          {showReplies && hasReplies && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              {comment.replies!.map(reply => (
                <CommentThread
                  key={reply.id}
                  comment={reply}
                  postId={postId}
                  onDelete={onDelete}
                  onLike={onLike}
                  onReply={onReply}
                  onReport={onReport}
                  depth={depth + 1}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
});
