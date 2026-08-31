import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { getViewerPostReaction } from '@/lib/postReactions';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { ShortCard } from '@/components/posts/ShortCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { FeedFailureNotice } from '@/components/posts/FeedFailureNotice';
import { toFeedError, hasMoreFeedRows, flattenUniqueFeedPosts, shouldHandleFeedShortcut, readFeedPreference, writeFeedPreference } from '@/lib/feedReliability';
import { useInView } from 'react-intersection-observer';
import { ArrowLeft, Film } from 'lucide-react';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { ensureMediaUrlsReady } from '@/lib/signedUrlCache';
import type { Post } from '@/hooks/useInfinitePosts';

const PAGE_SIZE = 15;

function transformRankedPost(row: any): Post {
  return {
    id: row.id || row.post_id,
    type: row.post_type || row.type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    caption: row.caption || '',
    tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
    created_at: row.created_at,
    is_pinned: row.is_pinned,
    view_count: row.view_count || 0,
    author: {
      id: row.author_id || row.author?.id,
      username: row.author_username || row.author?.username,
      avatar_url: row.author_avatar || row.author_avatar_url || row.author?.avatar_url,
    },
    like_count: Number(row.like_count) || 0,
    comment_count: Number(row.comment_count) || 0,
    is_liked: row.is_liked || false,
    is_bookmarked: row.is_bookmarked || false,
    reaction_type: row.reaction_type ?? null,
  } as Post;
}

async function presignPosts(posts: Post[]) {
  const urls: string[] = [];
  for (const p of posts) {
    if (p.media_url) urls.push(p.media_url);
    if (p.thumbnail_url) urls.push(p.thumbnail_url);
    if (p.author?.avatar_url) urls.push(p.author.avatar_url);
  }
  await ensureMediaUrlsReady(urls);
}

const CLIPS_PAGE_CLASS = 'vybe-clips-page';

function isClipVideo(post: Post): boolean {
  const type = String(post.type || '').toLowerCase();
  if (type === 'image' || type === 'text' || type === 'carousel') return false;
  return Boolean(post.media_url) && (type === 'short' || type === 'video' || type === 'clip' || !!post.media_url);
}

export default function ClipsViewer() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const { isMobileOrTablet } = useIsMobileOrTablet();
  const { isSlowConnection } = useNetworkStatus();

  const fromSource = (location.state as any)?.from || null;
  const fromConversationId = (location.state as any)?.conversationId || null;
  const isFromMessages = fromSource === 'messages';

  // ─── 1. Fetch the specific clicked post FIRST ───
  const initialQuery = useQuery({
    queryKey: ['clip-viewer-initial', postId, profile?.id],
    queryFn: async (): Promise<Post | null> => {
      if (!postId) return null;

      const { data: post, error: postErr } = await db
        .from('posts')
        .select(`
          id, type, media_url, thumbnail_url, caption, tags, created_at, is_pinned, view_count,
          author:profiles!posts_author_id_fkey (id, username, avatar_url)
        `)
        .eq('id', postId)
        .single();

      if (postErr) throw toFeedError(postErr);
      if (!post) return null;

      const [likeRes, commentRes, viewerReaction, isBookmarkedRes] = await Promise.all([
        db.from('likes').select('id', { count: 'exact', head: true }).eq('post_id', postId),
        db.from('comments').select('id', { count: 'exact', head: true }).eq('post_id', postId),
        profile
          ? getViewerPostReaction(postId, profile.id, user?.id)
          : Promise.resolve({ is_liked: false, reaction_type: null }),
        profile ? db.from('bookmarks').select('id').eq('post_id', postId).eq('user_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
      ]);

      const author = post.author as any;
      const result: Post = {
        id: post.id,
        type: post.type || 'short',
        media_url: post.media_url || '',
        thumbnail_url: post.thumbnail_url,
        caption: post.caption || '',
        tags: Array.isArray(post.tags) ? post.tags.filter((tag: unknown): tag is string => typeof tag === 'string') : [],
        created_at: post.created_at,
        is_pinned: post.is_pinned || false,
        author: {
          id: author?.id || '',
          username: author?.username || '',
          avatar_url: author?.avatar_url || null,
        },
        like_count: likeRes.count || 0,
        comment_count: commentRes.count || 0,
        is_liked: viewerReaction.is_liked,
        is_bookmarked: !!isBookmarkedRes.data,
        reaction_type: viewerReaction.reaction_type,
      };

      await presignPosts([result]);
      return result;
    },
    enabled: !!postId,
    staleTime: 5 * 60 * 1000,
  });
  const { data: initialPost, isLoading: loadingInitial } = initialQuery;

  // Long-form videos use the watch player, not the vertical clip viewer
  useEffect(() => {
    if (initialPost?.type === 'video' && postId) {
      navigate(`/watch/${postId}`, { replace: true, state: location.state });
    }
  }, [initialPost?.type, postId, navigate, location.state]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(CLIPS_PAGE_CLASS);
    return () => root.classList.remove(CLIPS_PAGE_CLASS);
  }, []);

  // ─── 2. Fetch infinite feed AFTER initial post ───
  const feedQuery = useInfiniteQuery({
    queryKey: ['clips-viewer-feed', profile?.id, postId],
    queryFn: async ({ pageParam = 0 }): Promise<{ posts: Post[]; nextPage: number | null }> => {
      if (profile?.id) {
        const { data, error } = await db.rpc('get_ranked_feed_v2', {
          p_user_id: profile.id,
          p_content_type: 'short',
          p_offset: (pageParam as number) * PAGE_SIZE,
          p_limit: PAGE_SIZE,
        });
        if (error) throw error;
        const posts = (data || []).map(transformRankedPost).filter((p) => p.id !== postId && isClipVideo(p));
        presignPosts(posts).catch(() => {});
        return { posts, nextPage: hasMoreFeedRows(data, PAGE_SIZE) ? pageParam + 1 : null };
      }

      const { data, error } = await db.rpc('get_trending_feed', {
        p_content_type: 'short',
        p_page: pageParam,
        p_page_size: PAGE_SIZE,
      });
      if (error) throw error;
      const posts = (data || []).map(transformRankedPost).filter((p) => p.id !== postId && isClipVideo(p));
      presignPosts(posts).catch(() => {});
      return { posts, nextPage: hasMoreFeedRows(data, PAGE_SIZE) ? pageParam + 1 : null };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!initialPost,
    staleTime: 5 * 60 * 1000,
  });

  // ─── 3. Merge: [clicked_post, ...feed_posts] ───
  const allClips = useMemo(() => {
    const feed = flattenUniqueFeedPosts(feedQuery.data?.pages);
    if (!initialPost) return feed;
    return [initialPost, ...feed.filter(isClipVideo)];
  }, [initialPost, feedQuery.data]);

  // ─── State ───
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(() => {
    const stored = readFeedPreference('vybe-clips-muted');
    return stored !== null ? stored === 'true' : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Video preloading
  const videoUrls = useMemo(() => allClips.map(s => s.media_url), [allClips]);
  useVideoPreload(videoUrls, {
    currentIndex,
    preloadDepth: isSlowConnection ? 1 : 2,
    enabled: !isSlowConnection,
  });

  // ─── Infinite scroll trigger ───
  const { ref: loadMoreRef, inView } = useInView({ threshold: 0, rootMargin: '200px' });
  useEffect(() => {
    if (inView && feedQuery.hasNextPage && !feedQuery.isFetchingNextPage) {
      feedQuery.fetchNextPage();
    }
  }, [inView, feedQuery.hasNextPage, feedQuery.isFetchingNextPage]);

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
  }, [allClips.length, currentIndex]);

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
      writeFeedPreference('vybe-clips-muted', String(next));
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black px-4">
        <EmptyState
          emoji="🎬"
          title="Clip not found"
          description="This clip may have been removed"
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

        {feedQuery.hasNextPage && (
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
