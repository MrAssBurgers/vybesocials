import { useState, useRef, useCallback, useEffect, memo, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { Image, Send, Smile, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment } from '@/hooks/useComments';
import { GifPicker } from '@/components/chat/GifPicker';
import { MentionInput } from './MentionInput';
import { CommentThread } from './CommentThread';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { navVisibility } from '@/lib/navVisibility';

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
  const dragControls = useDragControls();

  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0.6); // 60% of screen

  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `comments/${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      setMediaUrl(publicUrl);
      setMediaType('image');
    } catch (error) {
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [profile]);

  const handleGifSelect = useCallback((gifUrl: string) => {
    setMediaUrl(gifUrl);
    setMediaType('gif');
    setShowGifPicker(false);
  }, []);

  const clearMedia = useCallback(() => {
    setMediaUrl(null);
    setMediaType(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile) {
      toast.error('Please sign in to comment');
      return;
    }

    if (!text.trim() && !mediaUrl) return;

    try {
      await createComment.mutateAsync({
        postId,
        text: text.trim(),
        authorId,
        imageUrl: mediaUrl || undefined,
      });

      setText('');
      setMediaUrl(null);
      setMediaType(null);
      setReplyingTo(null);
    } catch (error) {
      // Error handled in mutation
    }
  }, [profile, text, mediaUrl, postId, authorId, createComment]);

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setText(`@${username} `);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setText('');
  }, []);

  const canSubmit = (text.trim() || mediaUrl) && !createComment.isPending && !isUploading;

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
              "bg-background rounded-t-3xl overflow-hidden",
              "shadow-2xl shadow-black/30",
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

                {/* Media preview */}
                <AnimatePresence>
                  {mediaUrl && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-2"
                    >
                      <div className="relative inline-block rounded-lg overflow-hidden border border-border max-w-[120px]">
                        <img
                          src={mediaUrl}
                          alt="Preview"
                          className="w-full h-auto max-h-20 object-cover"
                        />
                        <Button
                          variant="secondary"
                          size="icon"
                          onClick={clearMedia}
                          className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        {mediaType === 'gif' && (
                          <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded text-[8px] font-medium bg-black/60 text-white">
                            GIF
                          </span>
                        )}
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

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || !!mediaUrl}
                      className="h-7 w-7 flex-shrink-0"
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Image className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>

                    <div className="relative">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowGifPicker(!showGifPicker)}
                        disabled={!!mediaUrl}
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
