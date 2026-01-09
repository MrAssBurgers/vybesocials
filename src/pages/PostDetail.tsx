import { useParams, Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Heart, MessageCircle, Share2, Bookmark, MoreHorizontal, Flag, Ban } from 'lucide-react';
import { ModeratorActionsMenu } from '@/components/moderation/ModeratorActionsMenu';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useComments, useCreateComment } from '@/hooks/useComments';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
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
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

export default function PostDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [newComment, setNewComment] = useState('');
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

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !post) return;

    await createComment.mutateAsync({
      postId: post.id,
      text: newComment,
      authorId: post.author.id,
    });

    setNewComment('');
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
          {/* Media */}
          <div className="bg-card rounded-xl overflow-hidden border border-border">
            {post.type === 'video' || post.type === 'short' ? (
              <video
                src={post.media_url}
                controls
                className="w-full max-h-[600px] object-contain"
              />
            ) : (
              <img
                src={post.media_url}
                alt={post.caption}
                className="w-full max-h-[600px] object-contain"
              />
            )}
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

            {/* Comments */}
            <div className="flex-1 overflow-y-auto max-h-64 p-4 space-y-4">
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
                        <p className="text-sm">
                          <Link to={`/u/${comment.user.username}`} className="font-semibold mr-2">
                            {comment.user.username}
                          </Link>
                          {comment.text}
                        </p>
                        <ModeratorActionsMenu
                          userId={comment.user.id}
                          username={comment.user.username}
                          commentId={comment.id}
                          postId={post.id}
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </motion.div>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-8">No comments yet</p>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-border">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <button onClick={handleLike}>
                    <Heart
                      className={cn(
                        "h-6 w-6 transition-colors",
                        isLiked ? "fill-primary text-primary" : "hover:text-primary"
                      )}
                    />
                  </button>
                  <MessageCircle className="h-6 w-6" />
                  <button onClick={handleShare}>
                    <Share2 className="h-6 w-6 hover:text-primary transition-colors" />
                  </button>
                </div>
                <button onClick={handleBookmark}>
                  <Bookmark
                    className={cn(
                      "h-6 w-6 transition-colors",
                      isBookmarked ? "fill-foreground" : "hover:text-primary"
                    )}
                  />
                </button>
              </div>
              <p className="font-semibold mb-4">{likeCount.toLocaleString()} likes</p>

              {/* Comment input */}
              <form onSubmit={handleComment} className="flex gap-2">
                <Input
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  className="bg-secondary border-border"
                />
                <Button type="submit" disabled={!newComment.trim() || createComment.isPending}>
                  Post
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
