import { useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Send, Loader2, X, SortAsc, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment } from '@/hooks/useComments';
import { GifPicker } from '@/components/chat/GifPicker';
import { MentionInput } from './MentionInput';
import { CommentThread } from './CommentThread';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface InlineCommentsProps {
  postId: string;
  authorId: string;
  commentCount?: number;
}

type SortOption = 'newest' | 'top';

/**
 * YouTube-style inline comments section for long-form videos.
 * Lives directly below the video, scrollable, with video continuing to play.
 */
export const InlineComments = memo(function InlineComments({
  postId,
  authorId,
  commentCount = 0,
}: InlineCommentsProps) {
  const { profile } = useAuth();
  const { data: comments, isLoading } = useComments(postId);
  const createComment = useCreateComment();

  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [displayCount, setDisplayCount] = useState(5);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

      const { error: uploadError } = await db.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage
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

  // Sort comments
  const sortedComments = [...(comments || [])].sort((a, b) => {
    if (sortBy === 'newest') {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
    // For 'top', would need like_count in data - default to newest for now
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const visibleComments = sortedComments.slice(0, displayCount);
  const hasMore = sortedComments.length > displayCount;
  const canSubmit = (text.trim() || mediaUrl) && !createComment.isPending && !isUploading;

  return (
    <div className="border-t border-border mt-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h3 className="font-semibold">{commentCount} Comments</h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <SortAsc className="h-4 w-4" />
              Sort by
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setSortBy('top')}
              className={sortBy === 'top' ? 'bg-accent' : ''}
            >
              Top comments
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setSortBy('newest')}
              className={sortBy === 'newest' ? 'bg-accent' : ''}
            >
              Newest first
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Comment composer - pinned at top */}
      {profile && (
        <div className="flex gap-3 mb-6">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback>{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="flex-1 space-y-2">
            {/* Reply indicator */}
            <AnimatePresence>
              {replyingTo && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span>Replying to @{replyingTo.username}</span>
                  <Button variant="ghost" size="icon" aria-label="Cancel reply" className="h-5 w-5" onClick={cancelReply}>
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
                  className="relative inline-block"
                >
                  <div className="relative rounded-lg overflow-hidden border border-border max-w-[160px]">
                    <img
                      src={mediaUrl}
                      alt="Preview"
                      className="w-full h-auto max-h-24 object-cover"
                    />
                    <Button
                      variant="secondary"
                      size="icon"
                      aria-label="Remove media"
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
              <MentionInput
                value={text}
                onChange={setText}
                placeholder="Add a comment..."
                onSubmit={handleSubmit}
                className="flex-1"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Attach image"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !!mediaUrl}
                  className="h-9 w-9"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Image className="h-4 w-4" />
                  )}
                </Button>

                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    disabled={!!mediaUrl}
                    className="h-9 px-2 text-[11px] font-bold tracking-wider"
                    aria-label="Add a GIF"
                  >
                    GIF
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

                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  size="icon"
                  aria-label="Post comment"
                  className="h-9 w-9"
                >
                  {createComment.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-16 w-full rounded-2xl" />
              </div>
            </div>
          ))
        ) : visibleComments.length > 0 ? (
          <>
            {visibleComments.map(comment => (
              <CommentThread
                key={comment.id}
                comment={comment}
                postId={postId}
                onReply={handleReply}
              />
            ))}
            
            {hasMore && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setDisplayCount(prev => prev + 10)}
              >
                Show more comments
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No comments yet</p>
            <p className="text-sm text-muted-foreground/70">Be the first to share your thoughts!</p>
          </div>
        )}
      </div>
    </div>
  );
});
