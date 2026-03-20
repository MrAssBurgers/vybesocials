import { useState, useRef, useCallback, useEffect, memo, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { Send, Smile, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment, useDeleteComment } from '@/hooks/useComments';
import { GifPicker } from '@/components/chat/GifPicker';
import { MentionInput } from './MentionInput';
import { CommentThread } from './CommentThread';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navVisibility } from '@/lib/navVisibility';
import { useQueryClient } from '@tanstack/react-query';

interface CommentSheetProps {
  postId: string;
  authorId: string;
  commentCount?: number;
  isOpen: boolean;
  onClose: () => void;
  onOpenChange?: (open: boolean) => void;
}

export interface CommentSheetRef {
  open: () => void;
  close: () => void;
}

/**
 * Instagram-style bottom sheet for clip comments.
 * Slides up over the clip, dims background, clip pauses.
 * Drag down or tap outside to close.
 */
export const CommentSheet = memo(forwardRef<CommentSheetRef, CommentSheetProps>(function CommentSheet({
  postId,
  authorId,
  commentCount = 0,
  isOpen,
  onClose,
  onOpenChange,
}, ref) {
  const { profile } = useAuth();
  const { data: comments, isLoading } = useComments(postId);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const queryClient = useQueryClient();
  const dragControls = useDragControls();

  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0.6);

  // Like a comment
  const handleLikeComment = useCallback(async (commentId: string) => {
    if (!profile) return;
    
    // Optimistic update
    queryClient.setQueryData(['comments', postId], (old: any) => {
      if (!old) return old;
      return old.map((c: any) => {
        if (c.id === commentId) {
          const wasLiked = c.is_liked;
          return {
            ...c,
            is_liked: !wasLiked,
            like_count: wasLiked ? Math.max(0, (c.like_count || 0) - 1) : (c.like_count || 0) + 1,
          };
        }
        return c;
      });
    });

    try {
      const { data: existing } = await (supabase as any)
        .from('comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) {
        await (supabase as any).from('comment_likes').delete().eq('id', existing.id);
      } else {
        await (supabase as any).from('comment_likes').insert({
          comment_id: commentId,
          user_id: profile.id,
        });
      }
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
    }
  }, [profile, postId, queryClient]);

  // Delete a comment
  const handleDeleteComment = useCallback(async (commentId: string) => {
    deleteComment.mutate({ commentId, postId });
  }, [deleteComment, postId]);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Hide bottom nav when sheet is open
  useEffect(() => {
    if (isOpen) {
      navVisibility.setInCommunityChat(true);
    }
    return () => {
      if (isOpen) {
        navVisibility.setInCommunityChat(false);
      }
    };
  }, [isOpen]);

  // Expose open/close methods via ref
  useImperativeHandle(ref, () => ({
    open: () => onOpenChange?.(true),
    close: () => onClose(),
  }));

  // Handle drag end - close if dragged down enough
  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.velocity.y > 500 || info.offset.y > 150) {
      onClose();
    }
  }, [onClose]);

  const handleGifSelect = useCallback((url: string) => {
    setGifUrl(url);
    setShowGifPicker(false);
  }, []);

  const clearGif = useCallback(() => {
    setGifUrl(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile) {
      toast.error('Please sign in to comment');
      return;
    }

    if (!text.trim() && !gifUrl) return;

    try {
      await createComment.mutateAsync({
        postId,
        text: text.trim(),
        authorId,
        imageUrl: gifUrl || undefined,
      });

      setText('');
      setGifUrl(null);
      setReplyingTo(null);
    } catch (error) {
      // Error handled in mutation
    }
  }, [profile, text, gifUrl, postId, authorId, createComment]);

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setText(`@${username} `);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setText('');
  }, []);

  const canSubmit = (text.trim() || gifUrl) && !createComment.isPending;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90]"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className={cn(
              "fixed bottom-0 left-0 right-0 z-[91]",
              "bg-background/70 backdrop-blur-2xl backdrop-saturate-150 rounded-t-3xl overflow-hidden",
              "shadow-2xl shadow-black/30 border-t border-white/10",
              "flex flex-col",
              "max-h-[85vh]"
            )}
            style={{ height: `${sheetHeight * 100}vh` }}
          >
            {/* Drag handle */}
            <div 
              className="flex justify-center py-3 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-3 border-b border-border">
              <h3 className="font-semibold text-lg">Comments</h3>
              <span className="text-muted-foreground text-sm">{commentCount}</span>
            </div>

            {/* Comments list - scrollable */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4 overscroll-contain">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-12 w-full rounded-2xl" />
                    </div>
                  </div>
                ))
              ) : comments && comments.length > 0 ? (
                comments.map(comment => (
                  <CommentThread
                    key={comment.id}
                    comment={comment}
                    postId={postId}
                    onReply={handleReply}
                    onLike={handleLikeComment}
                    onDelete={handleDeleteComment}
                  />
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="text-4xl mb-3">💬</span>
                  <p className="text-muted-foreground font-medium">No comments yet</p>
                  <p className="text-sm text-muted-foreground/70">Start the conversation!</p>
                </div>
              )}
            </div>

            {/* Composer - pinned at bottom */}
            {profile && (
              <div className="border-t border-border p-3 bg-background/95 backdrop-blur-sm">
                {/* Reply indicator */}
                <AnimatePresence>
                  {replyingTo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 text-sm text-muted-foreground mb-2"
                    >
                      <span>Replying to @{replyingTo.username}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={cancelReply}>
                        <X className="h-3 w-3" />
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* GIF preview */}
                <AnimatePresence>
                  {gifUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2"
                    >
                      <div className="relative inline-block rounded-lg overflow-hidden border border-border max-w-[120px]">
                        <img
                          src={gifUrl}
                          alt="GIF Preview"
                          className="w-full h-auto max-h-20 object-cover"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={clearGif}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white">
                          GIF
                        </span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Input row */}
                <div className="flex items-end gap-2">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage src={profile.avatar_url || undefined} />
                    <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 flex items-end gap-1 bg-muted rounded-full px-3 py-1">
                    <MentionInput
                      value={text}
                      onChange={setText}
                      placeholder="Add a comment..."
                      onSubmit={handleSubmit}
                      className="border-0 bg-transparent p-0 min-h-[32px] focus-visible:ring-0"
                    />

                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowGifPicker(!showGifPicker)}
                        disabled={!!gifUrl}
                        className="h-7 w-7 flex-shrink-0"
                      >
                        <Smile className="h-4 w-4 text-muted-foreground" />
                      </Button>

                      <AnimatePresence>
                        {showGifPicker && (
                          <div className="absolute bottom-full right-0 mb-2 z-50">
                            <GifPicker
                              onSelect={handleGifSelect}
                              onClose={() => setShowGifPicker(false)}
                            />
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    size="icon"
                    className={cn(
                      "h-9 w-9 rounded-full flex-shrink-0 transition-all",
                      canSubmit ? "bg-primary" : "bg-muted"
                    )}
                  >
                    {createComment.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}));
