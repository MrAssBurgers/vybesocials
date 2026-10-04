import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Share2, 
  Bookmark, 
  ThumbsUp,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
} from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { AppLayout } from '@/components/layout/AppLayout';
import { VideoCard } from '@/components/explore/VideoCard';
import { SharedPostPreviewProvider, useActivePostPreview } from '@/components/chat/SharedPostPreviews';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { getViewerPostReaction } from '@/lib/postReactions';
import { usePostReaction } from '@/hooks/usePostReaction';
import { usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { InlineComments } from '@/components/comments/InlineComments';
import { ShareSheet } from '@/components/share/ShareSheet';
import { HoldToShare } from '@/components/share/HoldToShare';

export default function WatchPage() {
  const { id = '' } = useParams<{ id: string }>();
  return <SharedPostPreviewProvider conversationId={`watch:${id}`}><WatchContent /></SharedPostPreviewProvider>;
}

function WatchContent() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasCountedView = useRef(false);
  const didAutoplayRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);

  const account = useProfileAccount();
  const { entry, retry: retryVideo } = useActivePostPreview(id || '');
  const checked = entry.post;
  const isLoading = entry.status === 'queued' || entry.status === 'loading';
  const video = checked ? {
    id: checked.id, type: checked.type, media_url: checked.mediaUrl, caption: checked.caption,
    tags: checked.tags, created_at: checked.createdAt, view_count: checked.viewCount,
    author: { id: checked.author.id, username: checked.author.username, display_name: checked.author.displayName, avatar_url: checked.author.avatarUrl },
  } : null;
  const { data: interaction } = useQuery({
    queryKey: ['watch-detail-interaction', account.session.uid, account.session.epoch, profile?.id, id, entry.expires],
    enabled: !!video && account.ready,
    queryFn: async ({ signal }) => {
      account.guard();
      const [reaction, bookmark] = await Promise.all([
        getViewerPostReaction(id!, profile!.id, user?.id),
        db.from('bookmarks').select('id').eq('user_id', profile!.id).eq('post_id', id!).maybeSingle(),
      ]);
      account.guard();
      if (signal.aborted) throw new Error('Video session changed.');
      if (bookmark.error) throw bookmark.error;
      return { reaction, bookmarked: !!bookmark.data };
    },
    gcTime: 0, staleTime: 0, retry: false,
  });
  useEffect(() => { setIsBookmarked(!!interaction?.bookmarked); }, [interaction]);
  const { isLiked, likeCount, handleReaction } = usePostReaction({
    id: video?.id || '', author: { id: video?.author.id || '' },
    is_liked: !!interaction?.reaction.is_liked, reaction_type: interaction?.reaction.reaction_type || null,
    like_count: checked?.likeCount || 0,
  });
  const commentCount = checked?.commentCount || 0;

  // Related long-form videos from personalized feed
  const { data: relatedFeed } = usePersonalizedFeed('video', { enabled: video?.type === 'video' });
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
    if (video && video.type !== 'video' && id) {
      navigate(video.type === 'short' ? `/clips/${id}` : `/p/${id}`, { replace: true });
    }
  }, [video?.type, id, navigate]);

  // Count a view once playback starts
  useEffect(() => {
    if (!isPlaying || !id || hasCountedView.current) return;
    hasCountedView.current = true;
    void db.rpc('increment_view_count', { post_id_param: id }).then(() => {}, () => {});
  }, [isPlaying, id]);

  const signedUrl = video?.media_url;
  const signedAvatar = video?.author.avatar_url;
  useEffect(() => {
    didAutoplayRef.current = false;
    setIsPlaying(false); setProgress(0);
  }, [signedUrl]);

  // Autoplay when signed URL loads (mobile starts muted — browser policy)
  useEffect(() => {
    const el = videoRef.current;
    if (!signedUrl || !el || video?.type === 'short' || didAutoplayRef.current) return;
    didAutoplayRef.current = true;
    if (isMobileOrTablet) {
      el.muted = true;
      setIsMuted(true);
    }
    el.play().catch(() => {});
  }, [signedUrl, video?.type, isMobileOrTablet]);

  // Video controls
  const togglePlay = async () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        try { await videoRef.current.play(); } catch { toast.error('Playback could not start. Try again.'); }
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  useEffect(() => {
    const update = () => setIsFullscreen(!!videoRef.current && document.fullscreenElement === videoRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await videoRef.current?.requestFullscreen();
    } catch { toast.error('Fullscreen is unavailable on this device.'); }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const duration = videoRef.current.duration;
      const prog = Number.isFinite(duration) && duration > 0 ? Math.min(100, Math.max(0, videoRef.current.currentTime / duration * 100)) : 0;
      setProgress(prog);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = videoRef.current;
    if (el && Number.isFinite(el.duration) && el.duration > 0) {
      el.currentTime = Math.min(1, Math.max(0, Number(e.target.value) / 100)) * el.duration;
      handleTimeUpdate();
    }
  };
  const handleLike = () => { if (video) void handleReaction(isLiked ? null : 'like'); };

  const handleBookmark = async () => {
    if (!profile || !id || !video) return;

    const newIsBookmarked = !isBookmarked;
    setIsBookmarked(newIsBookmarked);

    try {
      account.guard();
      const result = newIsBookmarked
        ? await db.from('bookmarks').insert({ user_id: profile.id, post_id: id })
        : await db.from('bookmarks').delete().match({ user_id: profile.id, post_id: id });
      account.guard();
      if (result.error) throw result.error;
      if (newIsBookmarked) toast.success('Saved to bookmarks');
    } catch {
      setIsBookmarked(!newIsBookmarked); toast.error('Could not update your bookmarks.');
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

  if (isLoading || (video && video.type !== 'video')) {
    return (
      <AppLayout hideNav={isMobileOrTablet}>
        <div className="flex flex-col gap-4 items-center justify-center h-96 rounded-3xl bg-gradient-to-br from-primary/10 via-background to-accent/10">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full motion-safe:animate-spin" /><p role="status" className="text-sm text-muted-foreground">Opening your video…</p>
        </div>
      </AppLayout>
    );
  }

  if (!video) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-96">
          <span className="text-6xl mb-4">📹</span>
          <h2 className="text-xl font-semibold mb-2">{entry.status === 'error' ? 'Could not refresh this video' : 'This video is unavailable'}</h2>
          <p className="text-sm text-muted-foreground mb-4">It may have been removed or its audience changed.</p>
          {entry.status === 'error' && <Button className="rounded-full mb-3" onClick={retryVideo}>Try again</Button>}
          <Button onClick={() => navigate('/clips')}>Back to Clips</Button>
        </div>
      </AppLayout>
    );
  }

  const timeAgo = formatDistanceToNow(new Date(video.created_at), { addSuffix: true });

  return (
    <AppLayout hideRightSidebar hideNav={isMobileOrTablet}>
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
                key={signedUrl}
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
                <div
                  className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between"
                  style={{ paddingTop: 'calc(var(--sat, 0px) + 1rem)' }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-white hover:bg-white/20"
                    aria-label="Back from video"
                    onClick={goBack}
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                </div>

                {/* Center play button */}
                {!isPlaying && (
                  <button
                    aria-label="Play video"
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
                  <input type="range" aria-label="Video position" min={0} max={100} step={0.1}
                    value={progress} onChange={handleSeek} className="w-full h-2 rounded-full accent-primary cursor-pointer" />

                  {/* Control buttons */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-white hover:bg-white/20 h-8 w-8"
                        aria-label={isPlaying ? "Pause video" : "Resume video"}
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
                        aria-label={isMuted ? "Unmute video" : "Mute video"}
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
                      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
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
                    aria-label={isLiked ? 'Remove like' : 'Like video'}
                    aria-pressed={isLiked}
                    onClick={handleLike}
                  >
                    <ThumbsUp className={cn("h-4 w-4", isLiked && "fill-current")} />
                    {likeCount}
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
                accessScope={`${account.session.uid}:${account.session.epoch}:${profile?.id}:${entry.expires}`}
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
