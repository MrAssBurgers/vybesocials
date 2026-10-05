import { PostListReadStatus } from '@/components/posts/PostListReadStatus';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { getViewerPostReaction } from '@/lib/postReactions';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { ShortCard } from '@/components/posts/ShortCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedFailureNotice } from '@/components/posts/FeedFailureNotice';
import { flattenUniqueFeedPosts, shouldHandleFeedShortcut } from '@/lib/feedReliability';
import { readClipsMutedPreference, writeClipsMutedPreference } from '@/lib/videoPlayback';
import { useInView } from 'react-intersection-observer';
import { ArrowLeft, Film } from 'lucide-react';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import type { Post } from '@/hooks/useInfinitePosts';
import { useSocialFeed } from '@/hooks/useSocialFeed';
import { useProfileAccount } from '@/hooks/useProfileAccount';
import { SharedPostPreviewProvider, useActivePostPreview } from '@/components/chat/SharedPostPreviews';
import { FeedEmptyPage } from '@/components/feed/FeedEmptyPage';
import { latestPageAddsVisiblePosts } from '@/lib/feedContinuation';

const CLIPS_PAGE_CLASS = 'vybe-clips-page';

function isClipVideo(post: Post): boolean { return post.type === 'short' && !!post.media_url; }

export default function ClipsViewer() {
  const { postId = '' } = useParams<{ postId: string }>();
  return <SharedPostPreviewProvider conversationId={`clip-detail:${postId}`}><ClipsViewerContent /></SharedPostPreviewProvider>;
}

function ClipsViewerContent() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const { isMobileOrTablet } = useIsMobileOrTablet();

  const fromSource = (location.state as any)?.from || null;
  const isFromMessages = fromSource === 'messages';

  const account = useProfileAccount();
  const { entry, retry } = useActivePostPreview(postId || '');
  const checked = entry.post;
  const loadingInitial = entry.status === 'loading' || entry.status === 'queued';
  const initialQuery = { isError: entry.status === 'error', isFetching: loadingInitial, refetch: retry };
  const { data: interaction } = useQuery({
    queryKey: ['clip-detail-interaction', account.session.uid, account.session.epoch, profile?.id, postId, entry.expires],
    enabled: !!checked && account.ready,
    queryFn: async ({ signal }) => {
      account.guard();
      const [reaction, bookmark] = await Promise.all([
        getViewerPostReaction(postId!, profile!.id, user?.id),
        db.from('bookmarks').select('id').eq('post_id', postId!).eq('user_id', profile!.id).maybeSingle(),
      ]);
      account.guard();
      if (signal.aborted) throw new Error('Clip session changed.');
      if (bookmark.error) throw bookmark.error;
      return { reaction, bookmarked: !!bookmark.data };
    },
    staleTime: 0, gcTime: 0, retry: false,
  });
  const initialPost: Post | null = checked ? {
    id: checked.id, type: checked.type, caption: checked.caption, media_url: checked.mediaUrl || '',
    thumbnail_url: checked.thumbnailUrl, age_rating: checked.ageRating,
    tags: checked.tags, created_at: checked.createdAt, is_pinned: checked.isPinned,
    publication_revision: checked.publicationRevision, needs_owner_confirmation: checked.needsOwnerConfirmation,
    view_count: checked.viewCount, like_count: checked.likeCount, comment_count: checked.commentCount,
    is_liked: interaction?.reaction.is_liked || false, reaction_type: interaction?.reaction.reaction_type || null,
    is_bookmarked: interaction?.bookmarked || false,
    author: { id: checked.author.id, username: checked.author.username, avatar_url: checked.author.avatarUrl },
  } : null;

  // Preserve the dedicated long-video player and route ordinary posts to detail.
  useEffect(() => {
    if (initialPost && initialPost.type !== 'short' && postId) {
      navigate(initialPost.type === 'video' ? `/watch/${postId}` : `/p/${postId}`, { replace: true, state: location.state });
    }
  }, [initialPost?.type, postId, navigate, location.state]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(CLIPS_PAGE_CLASS);
    return () => root.classList.remove(CLIPS_PAGE_CLASS);
  }, []);

  // Recommendations use the same viewer-checked feed as the main Clips page.
  const feedQuery = useSocialFeed('short', !!initialPost && initialPost.type === 'short', 'personalized');
  const canAutoContinue = latestPageAddsVisiblePosts(feedQuery.data?.pages) && !feedQuery.isError;

  // ─── 3. Merge: [clicked_post, ...feed_posts] ───
  const allClips = useMemo(() => {
    const feed = flattenUniqueFeedPosts(feedQuery.data?.pages);
    if (!initialPost || !isClipVideo(initialPost)) return [];
    return [initialPost, ...feed.filter(post => post.id !== initialPost.id && isClipVideo(post))];
  }, [initialPost, feedQuery.data]);

  // ─── State ───
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(() => readClipsMutedPreference());
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const windowQuery = { ...feedQuery, advanceWindow: async () => { await feedQuery.advanceWindow(); setCurrentIndex(0); containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); },
    previousWindow: () => { feedQuery.previousWindow(); setCurrentIndex(0); containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); },
    restartWindow: () => { feedQuery.restartWindow(); setCurrentIndex(0); containerRef.current?.scrollTo({ top: 0, behavior: 'auto' }); } };


  // ─── Infinite scroll trigger ───
  const { ref: loadMoreRef, inView } = useInView({ threshold: 0, rootMargin: '200px' });
  useEffect(() => {
    if (canAutoContinue && inView && feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [canAutoContinue, inView, feedQuery.hasNextPage, feedQuery.isFetchingNextPage, feedQuery.fetchNextPage]);

  const clipOrder = JSON.stringify(allClips.map(clip => clip.id));
  useEffect(() => { setCurrentIndex(index => Math.min(index, Math.max(0, allClips.length - 1))); }, [allClips.length]);

  // ─── IntersectionObserver for active index ───
  useEffect(() => {
    if (!allClips.length) return;
    if (observerRef.current) observerRef.current.disconnect();

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = itemRefs.current.findIndex(ref => ref === entry.target);
            if (index !== -1 && index !== currentIndex) {
              setCurrentIndex(index);
            }
          }
        });
      },
      { root: containerRef.current, threshold: 0.6 }
    );

    itemRefs.current.forEach(ref => {
      if (ref) observerRef.current?.observe(ref);
    });

    return () => observerRef.current?.disconnect();
  }, [clipOrder, currentIndex]);

  // Keyboard nav (desktop)
  useEffect(() => {
    if (isMobileOrTablet) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!shouldHandleFeedShortcut(e)) return;
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      } else if (e.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, allClips.length, isMobileOrTablet]);

  const scrollToIndex = useCallback((index: number) => {
    if (index < 0 || index >= allClips.length) return;
    const target = itemRefs.current[index];
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [allClips]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => {
      const next = !prev;
      writeClipsMutedPreference(next);
      return next;
    });
  }, []);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/clips');
    }
  }, [navigate]);

  // ─── Loading ───
  if (loadingInitial) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col gap-4 items-center justify-center bg-gradient-to-br from-primary/15 via-background to-accent/15">
        <div aria-hidden className="w-12 h-12 border-4 border-primary/15 border-t-primary rounded-full motion-safe:animate-spin" /><p role="status" className="text-sm text-muted-foreground">Opening your clip…</p>
      </div>
    );
  }

  if (initialQuery.isError && !initialPost) {
    return <main id="main-content" tabIndex={-1} className="flex min-h-dvh items-center justify-center bg-background px-5 py-24">
      <FeedFailureNotice label="this clip" retrying={initialQuery.isFetching} onRetry={() => { void initialQuery.refetch(); }} />
    </main>;
  }

  // ─── Error / not found ───
  if (!initialPost && !loadingInitial) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/15 via-background to-accent/15 px-4">
        <EmptyState
          emoji="🎬"
          title="This clip is unavailable"
          description="It may have been removed or its audience changed."
          actionLabel="Browse Clips"
          onAction={() => navigate('/clips')}
        />
      </div>
    );
  }

  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;

  return (
    <div className={cn(
      "fixed inset-0 z-50 bg-black",
      isFromMessages && "animate-in slide-in-from-bottom duration-300"
    )}>
      <div
        ref={containerRef}
        className="h-[100svh] w-full overflow-y-scroll snap-y snap-mandatory scrollbar-hide overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
        }}
      >
        {allClips.map((clip, index) => (
          <div
            key={clip.id}
            ref={(el) => { itemRefs.current[index] = el; }}
            className="h-[100svh] w-full snap-start snap-always flex-shrink-0 flex justify-center animate-in fade-in duration-300"
          >
            <div className={cn(
              "relative h-full w-full",
              "sm:max-w-[480px] md:max-w-[420px] lg:max-w-[400px]"
            )}>
              <CardComponent
                post={clip}
                isActive={index === currentIndex}
                globalMuted={globalMuted}
                onToggleMute={handleToggleMute}
                {...(isMobileOrTablet ? { immersiveFlow: true as const } : {})}
              />
            </div>
          </div>
        ))}

        {(feedQuery.hasMoreWindow || feedQuery.hasPreviousWindow) && <div className="snap-start bg-background px-4 py-10"><PostListReadStatus query={windowQuery} /></div>}
        {feedQuery.isError ? <div className="snap-start bg-background px-4 py-10 text-center">
          <FeedFailureNotice label="clip recommendations" retrying={feedQuery.isFetching} onRetry={() => { void feedQuery.refetch(); }} />
          <button type="button" className="mt-4 min-h-11 text-sm text-primary hover:underline" onClick={() => navigate('/settings')}>Manage feed mutes in Settings</button>
        </div>
        : feedQuery.isLoading ? <p role="status" className="snap-start p-6 text-center text-white/70">Loading clip recommendations…</p>
        : feedQuery.hasNextPage && !canAutoContinue ? <div className="snap-start bg-background"><FeedEmptyPage hasMore loading={feedQuery.isFetchingNextPage} onLoadMore={() => { void feedQuery.fetchNextPage(); }}>{null}</FeedEmptyPage></div>
        : feedQuery.hasNextPage && (
          <div
            ref={loadMoreRef}
            className="h-20 flex items-center justify-center bg-black snap-start"
          >
            {feedQuery.isFetchingNextPage && (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
          </div>
        )}
      </div>

      {/* Back button — safe area aware */}
      <button
        aria-label="Back from clip"
        onClick={handleBack}
        className="fixed z-[60] w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20 active:bg-black/70 transition-colors shadow-lg"
        style={{
          top: 'calc(var(--app-header-safe, env(safe-area-inset-top, 0px)) + 16px)',
          left: '16px',
        }}
      >
        <ArrowLeft className="w-6 h-6 text-white" strokeWidth={2.5} />
      </button>

      {/* Source label — safe area aware, tappable to go back */}
      {fromSource && (
        <button
          onClick={handleBack}
          className="fixed z-[60] flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 backdrop-blur-sm active:bg-black/60 transition-colors"
          style={{
            top: 'calc(var(--app-header-safe, env(safe-area-inset-top, 0px)) + 20px)',
            left: '72px',
          }}
        >
          <Film className="h-3.5 w-3.5 text-white/80" />
          <span className="text-xs text-white/80 font-medium">
            From {fromSource === 'messages' ? 'Messages' : fromSource === 'notifications' ? 'Notifications' : 'Feed'}
          </span>
        </button>
      )}

      {/* Desktop progress dots */}
      {!isMobileOrTablet && allClips.length > 1 && (
        <div className="fixed right-2 top-1/2 -translate-y-1/2 z-[60] flex flex-col gap-1 pointer-events-none">
          {allClips.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, idx) => {
            const actualIdx = Math.max(0, currentIndex - 3) + idx;
            return (
              <div
                key={actualIdx}
                className="w-1 rounded-full bg-white transition-all duration-200"
                style={{
                  height: actualIdx === currentIndex ? 20 : 6,
                  opacity: actualIdx === currentIndex ? 1 : 0.3,
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
