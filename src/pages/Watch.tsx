import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Share2, 
  Bookmark, 
  ThumbsUp,
  ThumbsDown,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { VideoCard } from '@/components/explore/VideoCard';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { InlineComments } from '@/components/comments/InlineComments';
import { ShareSheet } from '@/components/share/ShareSheet';
import { HoldToShare } from '@/components/share/HoldToShare';

export default function WatchPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasCountedView = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLiked, setIsLiked] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [showShareSheet, setShowShareSheet] = useState(false);

  // Fetch video details
  const { data: video, isLoading } = useQuery({
    queryKey: ['video', id],
    queryFn: async () => {
      if (!id) return null;
      
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!author_id (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Related long-form videos from personalized feed
  const { data: relatedFeed } = usePersonalizedFeed('video', { enabled: !!id });
  const relatedVideos = useMemo(
    () =>
      relatedFeed?.pages
        .flatMap((page) => page.posts)
        .filter((p) => p.id !== id && p.type === 'video')
        .slice(0, 12) ?? [],
    [relatedFeed, id],
  );

  // Short clips belong in the vertical viewer
  useEffect(() => {
    if (video?.type === 'short' && id) {
      navigate(`/clips/${id}`, { replace: true });
    }
  }, [video?.type, id, navigate]);

  // Count a view once playback starts
  useEffect(() => {
    if (!isPlaying || !id || hasCountedView.current) return;
    hasCountedView.current = true;
    supabase.rpc('increment_view_count', { post_id_param: id }).catch(() => {});
  }, [isPlaying, id]);

  // Fetch like/bookmark status
  useEffect(() => {
    if (!profile || !id) return;

    const fetchStatus = async () => {
      const [likeRes, bookmarkRes, countRes, commentRes] = await Promise.all([
        supabase.from('likes').select('id').eq('post_id', id).eq('user_id', profile.id).single(),
        supabase.from('bookmarks').select('id').eq('post_id', id).eq('user_id', profile.id).single(),
        supabase.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', id),
        supabase.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', id),
      ]);

      setIsLiked(!!likeRes.data);
      setIsBookmarked(!!bookmarkRes.data);
      setLikeCount(countRes.count || 0);
      setCommentCount(commentRes.count || 0);
    };

    fetchStatus();
  }, [profile, id]);

  const signedUrl = useSignedUrl(video?.media_url);
  const signedAvatar = useSignedUrl(video?.author?.avatar_url);

  // Video controls
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        videoRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const prog = (videoRef.current.currentTime / videoRef.current.duration) * 100;
      setProgress(prog);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (videoRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pos = (e.clientX - rect.left) / rect.width;
      videoRef.current.currentTime = pos * videoRef.current.duration;
    }
  };

  const handleLike = async () => {
    if (!profile || !id) return;

    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikeCount(prev => newIsLiked ? prev + 1 : prev - 1);

    if (newIsLiked) {
      await supabase.from('likes').upsert({ user_id: profile.id, post_id: id }, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
    } else {
      await supabase.from('likes').delete().match({ user_id: profile.id, post_id: id });
    }
  };

  const handleBookmark = async () => {
    if (!profile || !id) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    if (newIsBookmarked) {
      await supabase.from('bookmarks').insert({ user_id: profile.id, post_id: id });
      toast.success('Saved to bookmarks');
    } else {
      await supabase.from('bookmarks').delete().match({ user_id: profile.id, post_id: id });
    }
  };

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/clips');
  };

  const handleShare = () => {
    setShowShareSheet(true);
  };

  if (isLoading || video?.type === 'short') {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!video) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <span className="text-6xl mb-4">📹</span>
          <h2 className="text-xl font-semibold mb-2">Video not found</h2>
          <Button onClick={() => navigate('/clips')}>Back to Clips</Button>
        </div>
      </AppLayout>
    );
  }

  const timeAgo = formatDistanceToNow(new Date(video.created_at), { addSuffix: true });

  return (
    <AppLayout hideRightSidebar>
      <div className={cn('max-w-7xl mx-auto', isMobileOrTablet && 'pb-24')}>
        <div className="flex flex-col lg:flex-row gap-6 p-4">
          {/* Main video player */}
          <div className="flex-1 min-w-0">
            <div 
              className="relative aspect-video bg-black rounded-xl overflow-hidden group"
              onMouseEnter={() => !isMobileOrTablet && setShowControls(true)}
              onMouseLeave={() => !isMobileOrTablet && setShowControls(false)}
              onClick={() => isMobileOrTablet && setShowControls((v) => !v)}
            >
              <video
                ref={videoRef}
                src={signedUrl || undefined}
                className="w-full h-full object-contain"
                playsInline
                preload="metadata"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                onTimeUpdate={handleTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />

              {/* Video controls overlay */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 transition-opacity",
                showControls || !isPlaying || isMobileOrTablet ? "opacity-100" : "opacity-0"
              )}>
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    onClick={goBack}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>

                {/* Center play button */}
                {!isPlaying && (
                  <button
                    onClick={togglePlay}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/30 transition-colors">
                      <Play className="h-8 w-8 text-white ml-1" fill="white" />
                    </div>
                  </button>
                )}

                {/* Bottom controls */}
                <div className="absolute bottom-0 left-0 right-0 p-4 space-y-2">
                  {/* Progress bar */}
                  <div 
                    className="w-full h-1 bg-white/30 rounded-full cursor-pointer group/progress"
                    onClick={handleSeek}
                  >
                    <div 
                      className="h-full bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))] rounded-full relative"
                      style={{ width: `${progress}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                    </div>
                  </div>

                  {/* Control buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 h-8 w-8"
                        onClick={togglePlay}
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" fill="white" />
                        ) : (
                          <Play className="h-5 w-5" fill="white" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 h-8 w-8"
                        onClick={toggleMute}
                      >
                        {isMuted ? (
                          <VolumeX className="h-5 w-5" />
                        ) : (
                          <Volume2 className="h-5 w-5" />
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20 h-8 w-8"
                      onClick={toggleFullscreen}
                    >
                      <Maximize className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Video info */}
            <div className="mt-4 space-y-4">
              <h1 className="text-xl font-bold">{video.caption || 'Untitled'}</h1>

              {/* Stats and actions */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>{video.view_count || 0} views</span>
                  <span>•</span>
                  <span>{timeAgo}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={cn("gap-2", isLiked && "bg-primary text-primary-foreground")}
                    onClick={handleLike}
                  >
                    <ThumbsUp className={cn("h-4 w-4", isLiked && "fill-current")} />
                    {likeCount}
                  </Button>
                  <Button variant="secondary" size="sm">
                    <ThumbsDown className="h-4 w-4" />
                  </Button>
                  <HoldToShare postId={id!} postType="video" mediaUrl={signedUrl || undefined}>
                    <Button variant="secondary" size="sm" className="gap-2" onClick={handleShare}>
                      <Share2 className="h-4 w-4" />
                      Share
                    </Button>
                  </HoldToShare>
                  <Button
                    variant="secondary"
                    size="sm"
                    className={cn("gap-2", isBookmarked && "bg-primary/15 text-primary")}
                    onClick={handleBookmark}
                  >
                    <Bookmark className={cn("h-4 w-4", isBookmarked && "fill-current")} />
                    Save
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Author info */}
              <div className="flex items-center gap-4">
                <Link to={`/u/${video.author?.username}`}>
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={signedAvatar || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      {video.author?.username?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </Link>
                <div className="flex-1">
                  <Link 
                    to={`/u/${video.author?.username}`}
                    className="font-semibold hover:underline"
                  >
                    @{video.author?.username}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {video.author?.display_name}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/u/${video.author?.username}`)}>
                  View profile
                </Button>
              </div>

              {/* Tags */}
              {video.tags && video.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {video.tags.map((tag: string) => (
                    <Link 
                      key={tag}
                      to={`/explore?tag=${tag}`}
                      className="text-sm text-primary hover:underline"
                    >
                      #{tag}
                    </Link>
                  ))}
                </div>
              )}

              {/* YouTube-style inline comments */}
              <InlineComments 
                postId={id!} 
                authorId={video.author?.id || ''} 
                commentCount={commentCount}
              />
            </div>
          </div>

          {/* Related videos — below on mobile, sidebar on desktop */}
          <div className="w-full lg:w-96 space-y-4">
            <h3 className="font-semibold">Up next</h3>
            <div className="space-y-3">
              {relatedVideos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No related videos yet</p>
              ) : (
                relatedVideos.map((post) => (
                  <VideoCard key={post.id} post={post} variant="horizontal" />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Share Sheet */}
      <ShareSheet
        isOpen={showShareSheet}
        onClose={() => setShowShareSheet(false)}
        postId={id!}
        postType="video"
        caption={video.caption}
        mediaUrl={signedUrl || undefined}
      />
    </AppLayout>
  );
}
