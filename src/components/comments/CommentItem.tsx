import { memo, useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Flag, MoreHorizontal, EyeOff, Eye, Pencil, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/auth';
import { useDeleteComment, useEditComment } from '@/hooks/useComments';
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

function CommentDropdownMenu({ isOwn, onDelete, onEdit, onReport, isDeleting }: {
  isOwn: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onReport: () => void;
  isDeleting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className={cn(
              "h-7 w-7 flex-shrink-0 transition-opacity duration-150",
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
          avoidCollisions={false}
          className="will-change-transform origin-[var(--radix-dropdown-menu-content-transform-origin)] border border-solid border-border animate-none data-[state=open]:animate-[opacity-in_0.15s_ease-out] data-[state=closed]:animate-[opacity-out_0.1s_ease-in]"
        >
          {isOwn ? (
            <>
              <DropdownMenuItem
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => {
                  setOpen(false);
                  setShowDeleteConfirm(true);
                }}
                className="text-destructive focus:text-destructive"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem onClick={onReport}>
              <Flag className="h-4 w-4 mr-2" />
              Report
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Your comment will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const CommentItem = memo(function CommentItem({ comment, postId }: CommentItemProps) {
  const { profile } = useAuth();
  const deleteComment = useDeleteComment();
  const editComment = useEditComment();
  const { data: safetySettings } = useSafetySettings();
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.text);
  const editInputRef = useRef<HTMLInputElement>(null);

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

  const handleEdit = () => {
    setEditText(comment.text);
    setIsEditing(true);
    setTimeout(() => editInputRef.current?.focus(), 50);
  };

  const handleEditSave = () => {
    const trimmed = editText.trim();
    if (!trimmed || trimmed === comment.text) {
      setIsEditing(false);
      return;
    }
    editComment.mutate(
      { commentId: comment.id, postId, text: trimmed },
      { onSuccess: () => setIsEditing(false) }
    );
  };

  const handleEditCancel = () => {
    setIsEditing(false);
    setEditText(comment.text);
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
                {isEditing ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      ref={editInputRef}
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleEditSave();
                        if (e.key === 'Escape') handleEditCancel();
                      }}
                      className="flex-1 min-w-0 text-sm bg-white/10 border border-border rounded-lg px-2 py-1 text-foreground outline-none focus:ring-1 focus:ring-primary"
                      disabled={editComment.isPending}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-primary"
                      onClick={handleEditSave}
                      disabled={editComment.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground"
                      onClick={handleEditCancel}
                      disabled={editComment.isPending}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : hasText ? (
                  <span className="text-sm break-words text-foreground">{comment.text}</span>
                ) : null}
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

          {!isBlurred && !isEditing && (
            <CommentDropdownMenu
              isOwn={isOwn}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onReport={handleReport}
              isDeleting={deleteComment.isPending}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
});
