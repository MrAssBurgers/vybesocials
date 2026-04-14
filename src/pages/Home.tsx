import { useState, useEffect, useMemo, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useInfiniteFollowingPosts, usePrefetchPosts, usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import type { Post } from '@/hooks/useInfinitePosts';
import { useDNAPreferences } from '@/hooks/useDNAPreferences';
import { useNewPostsBanner } from '@/hooks/usePostsRealtime';
import { useShowAds } from '@/hooks/useShowAds';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/lib/auth';
import { hasActiveReferral, isInviteEntryMode } from '@/lib/referral';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefresh';
import { PostCard } from '@/components/posts/PostCard';
import { PostSkeletonList } from '@/components/posts/PostSkeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { StoriesBar } from '@/components/stories/StoriesBar';
import { GreetingWidget } from '@/components/home/GreetingWidget';
import { GlobalEventBanner } from '@/components/events/GlobalEventBanner';
import { getAdInterval } from '@/components/ads/FeedAdCard';

const AutoFriendDrop = lazy(() => import('@/components/friends/AutoFriendDrop').then(m => ({ default: m.AutoFriendDrop })));
const AnnouncementModal = lazy(() => import('@/components/announcements/AnnouncementModal').then(m => ({ default: m.AnnouncementModal })));
const VYBECommandBar = lazy(() => import('@/components/ai/VYBECommandBar').then(m => ({ default: m.VYBECommandBar })));
const WeeklyRecapModal = lazy(() => import('@/components/recap/WeeklyRecapModal').then(m => ({ default: m.WeeklyRecapModal })));
const FeedAdCard = lazy(() => import('@/components/ads/FeedAdCard').then(m => ({ default: m.FeedAdCard })));

const MemoizedPostCard = memo(PostCard);

// DNA preference scoring
function getDNAScore(post: Post, boostSet: Set<string>, reduceSet: Set<string>): number {
  let score = 0;
  const tags = (post.tags || []).map(t => t.toLowerCase());
  const caption = (post.caption || '').toLowerCase();
  for (const tag of tags) {
    if (boostSet.has(tag)) score += 2;
    if (reduceSet.has(tag)) score -= 2;
  }
  for (const topic of boostSet) if (caption.includes(topic)) score += 1;
  for (const topic of reduceSet) if (caption.includes(topic)) score -= 1;
  return score;
}

interface HomePageProps {
  isInviteMode?: boolean;
}

export default function HomePage({ isInviteMode = false }: HomePageProps) {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const { showAds } = useShowAds();
  const { hasNewPosts, clearNewPosts } = useNewPostsBanner();
  const { data: dnaPrefs } = useDNAPreferences();

  const {
    data: forYouData,
    isLoading: forYouLoading,
    isFetching: forYouFetching,
    fetchNextPage: fetchNextForYou,
    hasNextPage: hasNextForYou,
    isFetchingNextPage: isFetchingNextForYou,
    refetch: refetchForYou,
  } = usePersonalizedFeed();

  const {
    data: followingData,
    isLoading: followingLoading,
    fetchNextPage: fetchNextFollowing,
    hasNextPage: hasNextFollowing,
    isFetchingNextPage: isFetchingNextFollowing,
    refetch: refetchFollowing,
  } = useInfiniteFollowingPosts();

  usePrefetchPosts();

  // Merge personalized + following, dedupe, sort by DNA then date
  const posts = useMemo(() => {
    const personalized = (forYouData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video');
    const following = (followingData?.pages.flatMap(page => page.posts) || [])
      .filter(post => post.type === 'post' || post.type === 'video');

    const seen = new Set<string>();
    const merged: Post[] = [];
    for (const post of [...following, ...personalized]) {
      if (!seen.has(post.id)) {
        seen.add(post.id);
        merged.push(post);
      }
    }

    if (dnaPrefs) {
      const boostSet = new Set((dnaPrefs.boost_topics || []).map(t => t.toLowerCase()));
      const reduceSet = new Set((dnaPrefs.reduce_topics || []).map(t => t.toLowerCase()));
      merged.sort((a, b) => {
        const aScore = getDNAScore(a, boostSet, reduceSet);
        const bScore = getDNAScore(b, boostSet, reduceSet);
        if (aScore !== bScore) return bScore - aScore;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return merged;
  }, [forYouData, followingData, dnaPrefs]);

  const isLoading = forYouLoading && followingLoading;

  const queryClient = useQueryClient();

  const handleRefresh = useCallback(async () => {
    clearNewPosts();
    queryClient.invalidateQueries({ queryKey: ['personalized-feed'] });
    queryClient.invalidateQueries({ queryKey: ['infinite-following-posts'] });
    await Promise.all([refetchForYou(), refetchFollowing()]);
  }, [queryClient, refetchForYou, refetchFollowing, clearNewPosts]);

  const { pullDistance, isRefreshing, threshold } = usePullToRefresh({
    onRefresh: handleRefresh,
  });

  // Infinite scroll
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreNodeRef = useRef<HTMLDivElement | null>(null);

  const fetchStateRef = useRef({ hasNextForYou, hasNextFollowing, isFetchingNextForYou, isFetchingNextFollowing });
  useEffect(() => {
    fetchStateRef.current = { hasNextForYou, hasNextFollowing, isFetchingNextForYou, isFetchingNextFollowing };
  }, [hasNextForYou, hasNextFollowing, isFetchingNextForYou, isFetchingNextFollowing]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const state = fetchStateRef.current;
          if (state.hasNextForYou && !state.isFetchingNextForYou) fetchNextForYou();
          if (state.hasNextFollowing && !state.isFetchingNextFollowing) fetchNextFollowing();
        }
      },
      { rootMargin: '400px', threshold: 0 }
    );
    observerRef.current = observer;
    if (loadMoreNodeRef.current) observer.observe(loadMoreNodeRef.current);
    return () => { observer.disconnect(); observerRef.current = null; };
  }, [fetchNextForYou, fetchNextFollowing]);

  const loadMoreRef = useCallback((node: HTMLDivElement | null) => {
    if (loadMoreNodeRef.current && observerRef.current) observerRef.current.unobserve(loadMoreNodeRef.current);
    loadMoreNodeRef.current = node;
    if (node && observerRef.current) observerRef.current.observe(node);
  }, []);

  // Ad positions
  const adPositions = useMemo(() => {
    if (!showAds || posts.length === 0) return new Set<number>();
    const positions = new Set<number>();
    let adIndex = 0;
    let next = getAdInterval(adIndex) - 1;
    while (next < posts.length) {
      positions.add(next);
      adIndex++;
      next += getAdInterval(adIndex);
    }
    return positions;
  }, [showAds, posts.length]);

  // Onboarding redirect
  useEffect(() => {
    if (authLoading) return;
    if (isInviteMode) return;
    if (!user) return;
    if (profile && profile.onboarding_completed === false) {
      if (hasActiveReferral() || isInviteEntryMode()) return;
      navigate('/onboarding');
    }
  }, [authLoading, user, profile, navigate, isInviteMode]);

  return (
    <AppLayout>
      <Suspense fallback={null}>
        <AutoFriendDrop />
      </Suspense>

      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        threshold={threshold}
      />

      <div
        className="max-w-xl mx-auto"
        data-tutorial="tutorial-welcome-center"
        style={{ transform: pullDistance > 0 ? `translateY(${pullDistance * 0.5}px)` : undefined }}
      >
        <Suspense fallback={null}>
          <AnnouncementModal />
        </Suspense>
        <GlobalEventBanner />

        {/* Greeting - compact inline */}
        <GreetingWidget />

        {/* Stories */}
        <StoriesBar />

        {/* New posts banner */}
        {hasNewPosts && (
          <button
            onClick={() => { clearNewPosts(); handleRefresh(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="w-full mb-4 mx-4 py-2.5 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 animate-in slide-in-from-top-2 duration-300"
            style={{ width: 'calc(100% - 2rem)' }}
          >
            <Sparkles className="h-4 w-4" />
            New posts available — tap to see
          </button>
        )}

        {/* Feed */}
        <div className="px-1 pb-6 space-y-4" data-tutorial="feed-area">
          {isLoading && posts.length === 0 ? (
            <PostSkeletonList count={3} />
          ) : posts.length === 0 ? (
            <EmptyState
              emoji="✨"
              title="Nothing here yet"
              description="Follow creators or explore to fill your feed!"
              actionLabel="Explore"
              onAction={() => navigate('/explore')}
            />
          ) : (
            <>
              {posts.map((post, index) => (
                <div key={post.id}>
                  <MemoizedPostCard post={post} />
                  {adPositions.has(index) && (
                    <Suspense fallback={null}><FeedAdCard /></Suspense>
                  )}
                </div>
              ))}
              <div ref={loadMoreRef} className="h-10 flex items-center justify-center">
                {(isFetchingNextForYou || isFetchingNextFollowing) && (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <VYBECommandBar />
      </Suspense>
      <Suspense fallback={null}>
        <WeeklyRecapModal />
      </Suspense>
    </AppLayout>
  );
}
