import { sortComments } from '@/lib/sortComments';
import { useDraftContinuationGuard } from '@/hooks/useDraftContinuationGuard';
import { CommentLoadError } from './CommentLoadError';
import { useState, useRef, useCallback, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image, Send, Loader2, X, SortAsc, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/auth';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { useComments, useCreateComment, useDeleteComment, useLikeComment } from '@/hooks/useComments';
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
  accessScope?: string;
}

type SortOption = 'newest' | 'top';

/**
 * YouTube-style inline comments section for long-form videos.
 * Lives directly below the video, scrollable, with video continuing to play.
 */
export const InlineComments = memo(function InlineComments(props: InlineCommentsProps) {
  const account = useProfileAccount();
  return <InlineCommentsSession key={`${account.session.uid}:${account.session.epoch}:${account.profile?.id}:${props.postId}`} {...props} />;
});
const InlineCommentsSession = memo(function InlineCommentsSession({
  postId,
  authorId,
  commentCount = 0,
  accessScope,
}: InlineCommentsProps) {
  const { profile } = useAuth();
  const { data: comments, isLoading, isError, isFetching, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useComments(postId, accessScope ? { scope: accessScope } : undefined);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const likeComment = useLikeComment();

  const [text, setText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; username: string } | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'gif' | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const captureSend = useDraftContinuationGuard(JSON.stringify([postId, text, mediaUrl, replyingTo]));
  const [isUploading, setIsUploading] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [displayCount, setDisplayCount] = useState(5);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadAttempt = useRef(0);
  const captureUpload = useDraftContinuationGuard(postId);
  useEffect(() => {
    uploadAttempt.current++;
    setIsUploading(false);
  }, [postId, profile?.id, profile?.user_id]);

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

    const active = captureUpload();
    if (!active()) return;
    const attempt = ++uploadAttempt.current;
    const current = () => active() && attempt === uploadAttempt.current;
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `comments/${profile.user_id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from('media')
        .upload(fileName, file);

      if (!current()) return;
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = db.storage
        .from('media')
        .getPublicUrl(fileName);

      setMediaUrl(publicUrl);
      setMediaType('image');
    } catch (error) {
      if (!current()) return;
      console.error('Failed to upload image:', error);
      toast.error('Failed to upload image');
    } finally {
      if (current()) {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    }
  }, [profile, captureUpload]);

  const handleGifSelect = useCallback((gifUrl: string) => {
    uploadAttempt.current++;
    setIsUploading(false);
    setMediaUrl(gifUrl);
    setMediaType('gif');
    setShowGifPicker(false);
  }, []);

  const clearMedia = useCallback(() => {
    uploadAttempt.current++;
    setIsUploading(false);
    setMediaUrl(null);
    setMediaType(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile) {
      toast.error('Please sign in to comment');
      return;
    }

    if (!text.trim() && !mediaUrl) return;

    if (createComment.isPending) return;
    const current = captureSend();
    if (!current()) return;
    try {
      await createComment.mutateAsync({
        postId,
        text: text.trim(),
        authorId,
        imageUrl: mediaUrl || undefined,
      });

      if (!current()) return;
      setText('');
      setMediaUrl(null);
      setMediaType(null);
      setReplyingTo(null);
    } catch (error) {
      // Error handled in mutation
    }
  }, [profile, text, mediaUrl, postId, authorId, createComment, captureSend]);

  const handleReply = useCallback((commentId: string, username: string) => {
    setReplyingTo({ id: commentId, username });
    setText(`@${username} `);
  }, []);

  const cancelReply = useCallback(() => {
    setReplyingTo(null);
    setText('');
  }, []);

  const sortedComments = sortComments(comments || [], sortBy);

  const visibleComments = sortedComments.slice(0, displayCount);
  const hasMore = sortedComments.length > displayCount || hasNextPage;
  const canSubmit = (text.trim() || mediaUrl) && !createComment.isPending && !isUploading;

  return (
    <div className="border-t border-border mt-4 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5" />
          <h3 className="font-semibold">{comments?.length ?? commentCount} Comments</h3>
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
        {isError ? (
          <CommentLoadError retry={() => void refetch()} pending={isFetching} />
        ) : isLoading ? (
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
                onDelete={() => deleteComment.mutate({ commentId: comment.id, postId, expectedRevision: comment.revision })}
                onLike={() => { if (!likeComment.isPending && !comment.needs_owner_confirmation) likeComment.mutate({ commentId: comment.id, postId, liked: !comment.is_liked }); }}
              />
            ))}
            
            {hasMore && (
              <Button
                variant="ghost"
                className="w-full"
                disabled={isFetchingNextPage} onClick={() => { setDisplayCount(prev => prev + 10); if (sortedComments.length <= displayCount && hasNextPage) void fetchNextPage(); }}
              >
                Show more comments
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-8">
            <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">{hasNextPage ? 'More comments available' : 'No comments yet'}</p>
            {hasNextPage && <Button variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>Load more comments</Button>}
            <p className="text-sm text-muted-foreground/70">Be the first to share your thoughts!</p>
          </div>
        )}
      </div>
    </div>
  );
});
