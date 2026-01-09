import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Flag, Ban, Trash2, Image, X, Loader2, Send, Smile } from 'lucide-react';
import { ModeratorActionsMenu } from '@/components/moderation/ModeratorActionsMenu';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment, useDeleteComment } from '@/hooks/useComments';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// Safe media component for post detail
function PostDetailMedia({ type, mediaUrl, caption }: { type: string; mediaUrl: string; caption?: string }) {
  const signedUrl = useSignedUrl(mediaUrl);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  if (!isValidMediaUrl(mediaUrl)) {
    return <MediaFallback type={type === 'video' || type === 'short' ? 'video' : 'image'} caption={caption} className="min-h-[300px] lg:min-h-[400px]" />;
  }

  if (hasError) {
    return <MediaFallback type={type === 'video' || type === 'short' ? 'video' : 'image'} caption={caption} className="min-h-[300px] lg:min-h-[400px]" />;
  }

  const isVideo = type === 'video' || type === 'short';

  return (
    <div className="relative bg-muted min-h-[300px] lg:min-h-[400px] flex items-center justify-center">
      {!isLoaded && <MediaSkeleton className="absolute inset-0" />}
      {isVideo ? (
        <video
          src={signedUrl || mediaUrl}
          controls
          className={cn("w-full max-h-[600px] object-contain transition-opacity", isLoaded ? "opacity-100" : "opacity-0")}
          onLoadedData={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          playsInline
        />
      ) : (
        <img
          src={signedUrl || mediaUrl}
          alt={caption || ''}
          className={cn("w-full max-h-[600px] object-contain transition-opacity", isLoaded ? "opacity-100" : "opacity-0")}
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
  const [commentImage, setCommentImage] = useState<File | null>(null);
  const [commentImagePreview, setCommentImagePreview] = useState<string | null>(null);
  const [commentGifUrl, setCommentGifUrl] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportDialogOpen, setReportDialogOpen] = useState(false);

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
            avatar_url
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;

      // Get counts
      const [likesResult, commentsResult] = await Promise.all([
        supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', id),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', id),
      ]);

      // Check if user has liked/bookmarked
      let userLiked = false;
      let userBookmarked = false;

      if (profile) {
        const [likeCheck, bookmarkCheck] = await Promise.all([
          supabase.from('likes').select('id').eq('user_id', profile.id).eq('post_id', id!).single(),
          supabase.from('bookmarks').select('id').eq('user_id', profile.id).eq('post_id', id!).single(),
        ]);
        userLiked = !!likeCheck.data;
        userBookmarked = !!bookmarkCheck.data;
      }

      setIsLiked(userLiked);
      setIsBookmarked(userBookmarked);
      setLikeCount(likesResult.count || 0);

      return {
        ...data,
        author: data.author as unknown as { id: string; username: string; avatar_url: string | null },
        comment_count: commentsResult.count || 0,
      };
    },
    enabled: !!id,
  });

  const { data: comments, isLoading: commentsLoading } = useComments(id!);
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();

  const handleLike = async () => {
    if (!profile || !post) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      await supabase.from('likes').insert({ user_id: profile.id, post_id: post.id });
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
      await navigator.share({ title: 'Check this out on LOLLoop', url });
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      setCommentImage(file);
      setCommentImagePreview(URL.createObjectURL(file));
    }
  };

  const clearCommentImage = () => {
    setCommentImage(null);
    setCommentImagePreview(null);
    setCommentGifUrl(null);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
  };

  const handleGifSelect = (gifUrl: string) => {
    setCommentGifUrl(gifUrl);
    setCommentImage(null);
    setCommentImagePreview(null);
    setShowGifPicker(false);
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!newComment.trim() && !commentImage && !commentGifUrl) || !post || !profile) return;

    let imageUrl: string | undefined = commentGifUrl || undefined;

    if (commentImage) {
      setIsUploadingImage(true);
      try {
        const fileExt = commentImage.name.split('.').pop();
        const filePath = `${profile.id}/${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(filePath, commentImage);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('media')
          .getPublicUrl(filePath);

        imageUrl = urlData.publicUrl;
      } catch (error) {
        console.error('Failed to upload image:', error);
        toast.error('Failed to upload image');
        setIsUploadingImage(false);
        return;
      }
      setIsUploadingImage(false);
    }

    await createComment.mutateAsync({
      postId: post.id,
      text: newComment,
      authorId: post.author.id,
      imageUrl,
    });

    setNewComment('');
    clearCommentImage();
    toast.success('Comment added!');
  };

  const handleReport = async () => {
    if (!profile || !post || !reportReason) return;

    await supabase.from('reports').insert({
      reporter_id: profile.id,
      post_id: post.id,
      reason: reportReason,
    });

    setReportDialogOpen(false);
    setReportReason('');
    toast.success('Report submitted. Thank you for helping keep LOLLoop safe!');
  };

  const handleBlockUser = async () => {
    if (!profile || !post) return;

    await supabase.from('blocked_users').insert({
      blocker_id: profile.id,
      blocked_id: post.author.id,
    });

    toast.success(`@${post.author.username} has been blocked`);
  };

  if (postLoading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Skeleton className="aspect-square max-h-[600px] rounded-xl" />
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

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-5 w-5" />
          Back
        </button>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Media - with shadow and proper sizing */}
          <div className="bg-card rounded-xl overflow-hidden border border-border shadow-lg lg:sticky lg:top-20 lg:self-start">
            <PostDetailMedia 
              type={post.type} 
              mediaUrl={post.media_url} 
              caption={post.caption || undefined} 
            />
          </div>

          {/* Details */}
          <div className="flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <Link to={`/u/${post.author.username}`} className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={post.author.avatar_url || undefined} />
                  <AvatarFallback>{post.author.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold">{post.author.username}</p>
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
                  {profile?.id !== post.author.id && (
                    <DropdownMenuItem onClick={handleBlockUser} className="text-destructive">
                      <Ban className="h-4 w-4 mr-2" />
                      Block @{post.author.username}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Caption & Tags */}
            <div className="p-4 border-b border-border">
              {post.caption && <p className="mb-2">{post.caption}</p>}
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {post.tags.map((tag) => (
                    <Link
                      key={tag}
                      to={`/explore?tag=${tag}`}
                      className="text-sm text-accent hover:underline"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Comments Section Header */}
            <div className="px-4 pt-4 pb-2 border-b border-border">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Comments</h3>
            </div>
            
            {/* Comments */}
            <div className="flex-1 overflow-y-auto max-h-80 lg:max-h-96 p-4 space-y-4">
              {commentsLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex gap-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments && comments.length > 0 ? (
                comments.map((comment) => (
                  <motion.div
                    key={comment.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-3 group"
                  >
                    <Link to={`/u/${comment.user.username}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.user.avatar_url || undefined} />
                        <AvatarFallback>{comment.user.username[0].toUpperCase()}</AvatarFallback>
                      </Avatar>
                    </Link>
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm">
                            <Link to={`/u/${comment.user.username}`} className="font-semibold mr-2">
                              {comment.user.username}
                            </Link>
                            {comment.text}
                          </p>
                          {comment.image_url && (
                            <img 
                              src={comment.image_url} 
                              alt="Comment attachment" 
                              className="mt-2 max-w-[200px] max-h-[150px] rounded-lg object-cover"
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {/* User can delete their own comment */}
                          {profile?.id === comment.user.id && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon-sm" className="text-destructive h-6 w-6">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="liquid-glass-card">
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete comment?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This action cannot be undone.
                                  </AlertDialogDescription>
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
                          {/* Mod actions for other users' comments */}
                          <ModeratorActionsMenu
                            userId={comment.user.id}
                            username={comment.user.username}
                            commentId={comment.id}
                            postId={post.id}
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8">
                  <p className="text-2xl mb-2">👀</p>
                  <p className="text-muted-foreground text-sm">Be the first to comment</p>
                </div>
              )}
            </div>

            {/* Actions - with micro-animations */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-5">
                  <motion.button 
                    whileTap={{ scale: 0.8 }}
                    onClick={handleLike}
                    className="p-2 -m-2 rounded-full hover:bg-secondary/50 transition-colors"
                  >
                    <motion.div
                      animate={isLiked ? { scale: [1, 1.3, 1] } : {}}
                      transition={{ duration: 0.3 }}
                    >
                      <Heart
                        className={cn(
                          "h-7 w-7 transition-colors",
                          isLiked ? "fill-red-500 text-red-500" : "hover:text-primary"
                        )}
                      />
                    </motion.div>
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.8 }}
                    className="p-2 -m-2 rounded-full hover:bg-secondary/50 transition-colors"
                  >
                    <MessageCircle className="h-7 w-7 hover:text-primary transition-colors" />
                  </motion.button>
                  <motion.button 
                    whileTap={{ scale: 0.8, rotate: 15 }}
                    onClick={handleShare}
                    className="p-2 -m-2 rounded-full hover:bg-secondary/50 transition-colors"
                  >
                    <Share2 className="h-7 w-7 hover:text-primary transition-colors" />
                  </motion.button>
                </div>
                <motion.button 
                  whileTap={{ scale: 0.8 }}
                  onClick={handleBookmark}
                  className="p-2 -m-2 rounded-full hover:bg-secondary/50 transition-colors"
                >
                  <motion.div
                    animate={isBookmarked ? { scale: [1, 1.2, 1] } : {}}
                    transition={{ duration: 0.3 }}
                  >
                    <Bookmark
                      className={cn(
                        "h-7 w-7 transition-colors",
                        isBookmarked ? "fill-yellow-400 text-yellow-400" : "hover:text-primary"
                      )}
                    />
                  </motion.div>
                </motion.button>
              </div>
              <p className="font-semibold text-lg mb-4">{likeCount.toLocaleString()} likes</p>

              {/* Comment input */}
              <form onSubmit={handleComment} className="space-y-2">
                <AnimatePresence>
                  {(commentImagePreview || commentGifUrl) && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="relative inline-block"
                    >
                      <img 
                        src={commentImagePreview || commentGifUrl || ''} 
                        alt="Preview" 
                        className="h-16 w-auto max-w-[120px] object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={clearCommentImage}
                        className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                      {commentGifUrl && (
                        <span className="absolute bottom-1 left-1 px-1 py-0.5 text-[8px] font-bold bg-black/60 text-white rounded">GIF</span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex gap-2">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={!!commentGifUrl}
                    className="shrink-0"
                  >
                    <Image className="h-5 w-5" />
                  </Button>
                  <div className="relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowGifPicker(!showGifPicker)}
                      disabled={!!commentImagePreview}
                      className="shrink-0"
                    >
                      <Smile className="h-5 w-5" />
                    </Button>
                    <AnimatePresence>
                      {showGifPicker && (
                        <div className="absolute bottom-full right-0 mb-2 z-50">
                          <GifPicker onSelect={handleGifSelect} onClose={() => setShowGifPicker(false)} />
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                  <Input
                    placeholder="Add a comment..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    className="bg-secondary border-border flex-1"
                  />
                  <motion.div whileTap={{ scale: 0.9 }}>
                    <Button 
                      type="submit" 
                      size="icon"
                      disabled={(!newComment.trim() && !commentImage && !commentGifUrl) || createComment.isPending || isUploadingImage}
                      className="shrink-0"
                    >
                      {isUploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </motion.div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
