import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Flag, Ban, Trash2, X, Loader2, Send, Smile, Pencil } from 'lucide-react';
import { useIsModOrAdmin, ModeratorMenuItems, ModeratorDialogs } from '@/components/moderation/ModeratorActionsMenu';
import { useUserRole } from '@/hooks/useModeration';
import { EditPostDialog } from '@/components/posts/EditPostDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment, useDeleteComment } from '@/hooks/useComments';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GifPicker } from '@/components/chat/GifPicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { MediaFallback, MediaSkeleton } from '@/components/ui/MediaFallback';
import { isValidMediaUrl } from '@/components/ui/SafeMedia';
import { StyledUsername } from '@/components/ui/StyledUsername';

// Safe media component for post detail
function PostDetailMedia({ type, mediaUrl, caption }: { type: string; mediaUrl: string; caption?: string }) {
  const signedUrl = useSignedUrl(mediaUrl);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!isValidMediaUrl(mediaUrl)) {
    return <MediaFallback type={type === 'video' || type === 'short' ? 'video' : 'image'} caption={caption} className="min-h-[300px] lg:min-h-[500px]" />;
  }

  if (hasError) {
    return <MediaFallback type={type === 'video' || type === 'short' ? 'video' : 'image'} caption={caption} className="min-h-[300px] lg:min-h-[500px]" />;
  }

  const isVideo = type === 'video' || type === 'short';

  return (
    <div className="relative bg-black/20 min-h-[300px] lg:min-h-[500px] flex items-center justify-center">
      {/* Blurred background fill */}
      {isLoaded && !isVideo && (
        <div 
          className="absolute inset-0 blur-3xl scale-125 opacity-30"
          style={{ 
            backgroundImage: `url(${signedUrl || mediaUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      )}
      {!isLoaded && <MediaSkeleton className="absolute inset-0" />}
      {isVideo ? (
        <video
          src={signedUrl || mediaUrl}
          controls
          className={cn("relative w-full max-h-[70vh] object-contain transition-opacity z-10", isLoaded ? "opacity-100" : "opacity-0")}
          onLoadedData={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          playsInline
        />
      ) : (
        <img
          src={signedUrl || mediaUrl}
          alt={caption || ''}
          className={cn("relative w-full max-h-[70vh] object-contain transition-opacity z-10", isLoaded ? "opacity-100" : "opacity-0")}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      )}
    </div>
  );
}

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [newComment, setNewComment] = useState('');
  const [commentGifUrl, setCommentGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [warnDialogOpen, setWarnDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [memeBanDialogOpen, setMemeBanDialogOpen] = useState(false);
  const [deleteContentDialog, setDeleteContentDialog] = useState<{ type: 'post' | 'comment' | 'listing'; id: string } | null>(null);
  const queryClient = useQueryClient();
  const { data: userRole } = useUserRole();
  const isModOrAdmin = useIsModOrAdmin();
  const commentInputRef = useRef<HTMLInputElement>(null);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ['post', id, profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select(`
          id,
          type,
          media_url,
          caption,
          tags,
          created_at,
          author:profiles!author_id (
            id,
            username,
            avatar_url,
            display_name
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      const [likesResult, commentsResult] = await Promise.all([
        supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', id),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', id),
      ]);

      let userLiked = false;
      let userBookmarked = false;

      if (profile) {
        const [likeCheck, bookmarkCheck] = await Promise.all([
          supabase.from('likes').select('id').eq('user_id', profile.id).eq('post_id', id!).maybeSingle(),
          supabase.from('bookmarks').select('id').eq('user_id', profile.id).eq('post_id', id!).maybeSingle(),
        ]);
        userLiked = !!likeCheck.data;
        userBookmarked = !!bookmarkCheck.data;
      }

      setIsLiked(userLiked);
      setIsBookmarked(userBookmarked);
      setLikeCount(likesResult.count || 0);

      return {
        ...data,
        author: data.author as unknown as { id: string; username: string; avatar_url: string | null; display_name: string | null },
        comment_count: commentsResult.count || 0,
      };
    },
    enabled: !!id,
  });

  const { data: comments, isLoading: commentsLoading } = useComments(id!);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();

  const isOwnPost = profile?.id === post?.author?.id;
  const isAdmin = userRole === 'admin' || userRole === 'moderator';
  const canDelete = isOwnPost || isAdmin;

  const handleDelete = async () => {
    if (!post) return;
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const { error } = await supabase.from('posts').delete().eq('id', post.id);
      if (error) throw error;
      toast.success('Post deleted');
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      navigate(-1);
    } catch (error) {
      console.error('Failed to delete post:', error);
      toast.error('Failed to delete post');
    }
  };

  const handleLike = async () => {
    if (!profile || !post) return;
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id });
      if (post.author.id !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: post.author.id, type: 'like', actor_id: profile.id, post_id: post.id,
        });
      }
    } else {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: post.id });
    }
  };

  const handleBookmark = async () => {
    if (!profile || !post) return;
    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    if (newIsBookmarked) {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: post.id });
      toast.success('Saved to bookmarks');
    } else {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: post.id });
      toast.success('Removed from bookmarks');
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: 'Check this out', url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied!');
    }
  };

  const handleGifSelect = (gifUrl: string) => {
    setCommentGifUrl(gifUrl);
    setShowGifPicker(false);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newComment.trim() && !commentGifUrl) || !post || !profile) return;

    await createComment.mutateAsync({
      postId: post.id,
      text: newComment,
      authorId: post.author.id,
      imageUrl: commentGifUrl || undefined,
    });

    setNewComment('');
    setCommentGifUrl(null);
    toast.success('Comment added!');
  };

  const handleReport = async () => {
    if (!profile || !post || !reportReason) return;
    await supabase.from('reports').insert({ reporter_id: profile.id, post_id: post.id, reason: reportReason });
    setReportDialogOpen(false);
    setReportReason('');
    toast.success('Report submitted');
  };

  const handleBlockUser = async () => {
    if (!profile || !post) return;
    await supabase.from('blocked_users').insert({ blocker_id: profile.id, blocked_id: post.author.id });
    toast.success(`@${post.author.username} blocked`);
  };

  // Loading state
  if (postLoading) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="aspect-square rounded-2xl" />
          <div className="flex gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 flex-1 rounded-xl" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!post) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <p className="text-4xl mb-4">😕</p>
          <p className="text-muted-foreground">Post not found</p>
        </div>
      </AppLayout>
    );
  }

  const commentsList = comments || [];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto pb-6">
        {/* Sticky header bar */}
        <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-background/60 backdrop-blur-2xl backdrop-saturate-150 border-b border-white/10">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-secondary/50 transition-colors active:scale-90"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link to={`/u/${post.author.username}`} className="flex items-center gap-2.5 flex-1 min-w-0">
            <Avatar className="h-8 w-8 ring-2 ring-primary/20">
              <AvatarImage src={post.author.avatar_url || undefined} />
              <AvatarFallback className="text-xs">{post.author.username[0].toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <StyledUsername
                userId={post.author.id}
                username={post.author.username}
                className="font-semibold text-sm truncate"
                preferDisplayName={false}
              />
              <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </p>
            </div>
          </Link>
          
          {/* More menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {isOwnPost && (
                <DropdownMenuItem onClick={() => setIsEditOpen(true)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Post
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem onClick={handleDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Post
                </DropdownMenuItem>
              )}
              <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
                <DialogTrigger asChild>
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    <Flag className="h-4 w-4 mr-2" />
                    Report
                  </DropdownMenuItem>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Report Post</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Select value={reportReason} onValueChange={setReportReason}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a reason" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spam">Spam</SelectItem>
                        <SelectItem value="harassment">Harassment</SelectItem>
                        <SelectItem value="inappropriate">Inappropriate content</SelectItem>
                        <SelectItem value="violence">Violence</SelectItem>
                        <SelectItem value="copyright">Copyright violation</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleReport} disabled={!reportReason} className="w-full">
                      Submit Report
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {!isOwnPost && (
                <DropdownMenuItem onClick={handleBlockUser} className="text-destructive">
                  <Ban className="h-4 w-4 mr-2" />
                  Block @{post.author.username}
                </DropdownMenuItem>
              )}
              {isModOrAdmin && !isOwnPost && (
                <ModeratorMenuItems
                  userId={post.author.id}
                  username={post.author.username}
                  postId={post.id}
                  onWarnClick={() => setWarnDialogOpen(true)}
                  onBanClick={() => setBanDialogOpen(true)}
                  onMemeBanClick={() => setMemeBanDialogOpen(true)}
                  onDeleteContentClick={(type, id) => setDeleteContentDialog({ type, id })}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ModeratorDialogs
            userId={post.author.id}
            username={post.author.username}
            warnDialogOpen={warnDialogOpen}
            setWarnDialogOpen={setWarnDialogOpen}
            banDialogOpen={banDialogOpen}
            setBanDialogOpen={setBanDialogOpen}
            memeBanDialogOpen={memeBanDialogOpen}
            setMemeBanDialogOpen={setMemeBanDialogOpen}
            deleteContentDialog={deleteContentDialog}
            setDeleteContentDialog={setDeleteContentDialog}
          />
          {isOwnPost && (
            <EditPostDialog
              open={isEditOpen}
              onOpenChange={setIsEditOpen}
              post={{ id: post.id, caption: post.caption || '', tags: post.tags || [] }}
            />
          )}
        </div>

        {/* Media — flush with card below */}
        <div className="mx-3 overflow-hidden rounded-t-2xl">
          <PostDetailMedia 
            type={post.type} 
            mediaUrl={post.media_url} 
            caption={post.caption || undefined} 
          />
        </div>

        {/* Content card — seamlessly connected to media */}
        <div className="mx-3 rounded-b-2xl bg-background/90 backdrop-blur-2xl backdrop-saturate-150 border border-t-0 border-white/10 shadow-xl overflow-hidden">
          {/* Action bar */}
          <div className="px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <motion.button 
                  whileTap={{ scale: 0.75 }}
                  onClick={handleLike}
                  className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-secondary/50 transition-colors"
                >
                  <motion.div
                    animate={isLiked ? { scale: [1, 1.4, 1] } : {}}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                  >
                    <Heart
                      className={cn(
                        "h-7 w-7 transition-colors",
                        isLiked ? "fill-red-500 text-red-500" : "text-white/90"
                      )}
                      strokeWidth={isLiked ? 0 : 2}
                    />
                  </motion.div>
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.75 }}
                  onClick={() => commentInputRef.current?.focus()}
                  className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-secondary/50 transition-colors"
                >
                  <MessageCircle className="h-7 w-7 text-white/90" strokeWidth={2} />
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.75, rotate: 15 }}
                  onClick={handleShare}
                  className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-secondary/50 transition-colors"
                >
                  <Share2 className="h-7 w-7 text-white/90" strokeWidth={2} />
                </motion.button>
              </div>
              <motion.button 
                whileTap={{ scale: 0.75 }}
                onClick={handleBookmark}
                className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-secondary/50 transition-colors"
              >
                <motion.div
                  animate={isBookmarked ? { scale: [1, 1.3, 1] } : {}}
                  transition={{ duration: 0.3 }}
                >
                  <Bookmark
                    className={cn(
                      "h-7 w-7 transition-colors",
                      isBookmarked ? "fill-yellow-400 text-yellow-400" : "text-white/90"
                    )}
                    strokeWidth={isBookmarked ? 0 : 2}
                  />
                </motion.div>
              </motion.button>
            </div>

            {/* Like count */}
            <p className="font-bold text-sm mt-1 text-white/90">{likeCount.toLocaleString()} likes</p>

            {/* Caption */}
            {post.caption && (
              <div className="mt-1.5">
                <p className="text-sm text-white/90">
                  <Link to={`/u/${post.author.username}`} className="font-bold mr-1.5 hover:underline">
                    {post.author.username}
                  </Link>
                  {post.caption}
                </p>
              </div>
            )}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {post.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/explore?tag=${tag}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <p className="text-[11px] text-muted-foreground mt-2 uppercase tracking-wide">
              {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
            </p>
          </div>

          {/* Divider */}
          <div className="h-px bg-white/10 mx-4" />

        {/* Comments section */}
        <div className="px-4 py-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-4">
            {post.comment_count > 0 ? `Comments (${post.comment_count})` : 'Comments'}
          </h3>

          <div className="space-y-3 max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
            {commentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3 p-3">
                  <Skeleton className="h-9 w-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-full" />
                  </div>
                </div>
              ))
            ) : commentsList.length > 0 ? (
              commentsList.map((comment) => (
                <motion.div
                  key={comment.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-3 group bg-white/5 backdrop-blur-md rounded-2xl p-3 border border-white/10"
                >
                  <Link to={`/u/${comment.user.username}`} className="flex-shrink-0">
                    <Avatar className="h-9 w-9">
                      <AvatarImage src={comment.user.avatar_url || undefined} />
                      <AvatarFallback className="text-xs">{comment.user.username[0].toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white/90">
                          <Link to={`/u/${comment.user.username}`}>
                            <StyledUsername
                              userId={comment.user.id}
                              username={comment.user.username}
                              className="font-bold text-sm mr-1.5"
                              preferDisplayName={false}
                            />
                          </Link>
                          <span className="break-words">{comment.text}</span>
                        </p>
                        {comment.image_url && (
                          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2">
                            <img 
                              src={comment.image_url} 
                              alt="" 
                              className="max-w-[200px] max-h-[150px] rounded-xl object-cover border border-white/10"
                            />
                          </motion.div>
                        )}
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      {profile?.id === comment.user.id && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity rounded-full text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="liquid-glass-card">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteComment.mutate({ commentId: comment.id, postId: post.id })}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="text-3xl mb-2">💬</span>
                <p className="text-sm text-muted-foreground font-medium">No comments yet</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Be the first to share your thoughts</p>
              </div>
            )}
          </div>
        </div>
        </div>{/* end content card */}

        {/* Comment input - sticky bottom */}
        {profile && (
          <div className="sticky bottom-0 z-20 mx-3 mb-3 px-4 py-3 rounded-2xl bg-background/80 backdrop-blur-2xl backdrop-saturate-150 border border-white/10 shadow-xl">
            {/* GIF preview */}
            <AnimatePresence>
              {commentGifUrl && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-2"
                >
                  <div className="relative inline-block rounded-xl overflow-hidden border border-white/10 max-w-[100px]">
                    <img src={commentGifUrl} alt="GIF" className="w-full h-auto max-h-16 object-cover" />
                    <button
                      type="button"
                      onClick={() => setCommentGifUrl(null)}
                      className="absolute top-1 right-1 h-5 w-5 bg-background/80 backdrop-blur rounded-full flex items-center justify-center"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <span className="absolute bottom-1 left-1 px-1 py-0.5 text-[8px] font-bold bg-black/60 text-white rounded">GIF</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleComment} className="flex items-end gap-2">
              <Avatar className="h-8 w-8 flex-shrink-0">
                <AvatarImage src={profile.avatar_url || undefined} />
                <AvatarFallback className="text-xs">{profile.username?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>

              <div className="flex-1 flex items-center gap-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
                <input
                  ref={commentInputRef}
                  type="text"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-w-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleComment(e);
                    }
                  }}
                />

                <div className="relative flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowGifPicker(!showGifPicker)}
                    disabled={!!commentGifUrl}
                    className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                  >
                    <Smile className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <AnimatePresence>
                    {showGifPicker && (
                      <div className="absolute bottom-full right-0 mb-2 z-50">
                        <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <motion.div whileTap={{ scale: 0.85 }}>
                <Button 
                  type="submit" 
                  size="icon"
                  disabled={(!newComment.trim() && !commentGifUrl) || createComment.isPending}
                  className={cn(
                    "h-9 w-9 rounded-full flex-shrink-0 transition-all",
                    (newComment.trim() || commentGifUrl) ? "bg-primary shadow-lg shadow-primary/30" : "bg-muted"
                  )}
                >
                  {createComment.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </motion.div>
            </form>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
