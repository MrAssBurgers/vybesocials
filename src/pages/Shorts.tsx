import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePersonalizedFeed, useInfiniteFollowingPosts } from '@/hooks/useInfinitePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipSkeleton } from '@/components/clips/ClipSkeleton';
import { ClipsFeedHeader } from '@/components/clips/ClipsFeedHeader';
import { useInView } from 'react-intersection-observer';
import { useNavigate } from 'react-router-dom';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useAheadMediaPreload } from '@/hooks/useAheadMediaPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { useVideoAds } from '@/hooks/useVideoAds';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import {
  CLIPS_BOTTOM_UI_OFFSET,
  loadClipsFeedTab,
  saveClipsFeedTab,
  type ClipsFeedTab,
} from '@/lib/clipsLayout';

const CLIPS_HINT_KEY = 'vybe-clips-hint-seen';
const CLIPS_PAGE_CLASS = 'vybe-clips-page';

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const shuffled = [...items];
  let s = seed;
  const seededRandom = () => {
    s = (s * 16807 + 0.5) % 1;
    return Math.abs(s);
  };
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function ClipsPage() {
  const navigate = useNavigate();
  const [feedTab, setFeedTab] = useState<ClipsFeedTab>(() => loadClipsFeedTab());
  const sessionSeed = useMemo(() => Math.random(), []);

  const forYouQuery = usePersonalizedFeed('short', { enabled: feedTab === 'foryou' });
  const followingQuery = useInfiniteFollowingPosts('short', { enabled: feedTab === 'following' });

  const activeQuery = feedTab === 'foryou' ? forYouQuery : followingQuery;
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = activeQuery;

  const shorts = useMemo(() => {
    const allPosts = data?.pages.flatMap((page) => page.posts) || [];
    if (allPosts.length === 0) return [];
    return feedTab === 'foryou' ? shuffleWithSeed(allPosts, sessionSeed) : allPosts;
  }, [data, sessionSeed, feedTab]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(() => {
    const stored = localStorage.getItem('vybe-clips-muted');
    return stored !== null ? stored === 'true' : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const { isMobileOrTablet } = useIsMobileOrTablet();
  const nativePerf = isNativePerfMode();
  const { isSlowConnection } = useNetworkStatus();
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    try {
      return !localStorage.getItem(CLIPS_HINT_KEY);
    } catch {
      return true;
    }
  });

  const containerHeight = '100dvh';

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(CLIPS_PAGE_CLASS);
    root.style.setProperty('--clips-bottom-ui', CLIPS_BOTTOM_UI_OFFSET);
    root.style.setProperty('--clips-progress-bottom', CLIPS_BOTTOM_UI_OFFSET);
    return () => {
      root.classList.remove(CLIPS_PAGE_CLASS);
      root.style.removeProperty('--clips-bottom-ui');
      root.style.removeProperty('--clips-progress-bottom');
    };
  }, []);

  const handleFeedTabChange = useCallback((tab: ClipsFeedTab) => {
    setFeedTab(tab);
    saveClipsFeedTab(tab);
    setCurrentIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    setCurrentIndex(0);
    containerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [feedTab]);

  const videoUrls = useMemo(() => shorts.map((s) => s.media_url), [shorts]);
  useVideoPreload(videoUrls, {
    currentIndex,
    preloadDepth: isSlowConnection ? 2 : 5,
    enabled: !isSlowConnection,
  });

  useAheadMediaPreload(shorts as any, currentIndex, 3);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '1200px',
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    if (!shorts?.length) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
            const index = itemRefs.current.findIndex((ref) => ref === entry.target);
            if (index !== -1 && index !== currentIndex) {
              setCurrentIndex(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: [0.55, 0.75],
      },
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observerRef.current?.observe(ref);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [shorts?.length, currentIndex]);

  const { showVideoAd, isMidFeedAdSlot } = useVideoAds();
  const preRollFiredRef = useRef(false);
  const lastAdIndexRef = useRef(-1);

  useEffect(() => {
    if (nativePerf) return;
    if (preRollFiredRef.current) return;
    if (!shorts || shorts.length === 0) return;
    preRollFiredRef.current = true;
    const t = setTimeout(() => {
      showVideoAd('pre_roll');
    }, 800);
    return () => clearTimeout(t);
  }, [shorts, showVideoAd, nativePerf]);

  useEffect(() => {
    if (currentIndex === lastAdIndexRef.current) return;
    if (!isMidFeedAdSlot(currentIndex)) return;
    lastAdIndexRef.current = currentIndex;
    showVideoAd('mid_feed');
  }, [currentIndex, isMidFeedAdSlot, showVideoAd]);

  useEffect(() => {
    if (isMobileOrTablet) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, shorts?.length, isMobileOrTablet]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!shorts || index < 0 || index >= shorts.length) return;
      const target = itemRefs.current[index];
      if (target) {
        target.scrollIntoView({
          behavior: nativePerf ? 'auto' : 'smooth',
          block: 'start',
        });
      }
    },
    [shorts, nativePerf],
  );

  useEffect(() => {
    if (currentIndex > 0 && showSwipeHint) {
      setShowSwipeHint(false);
      try {
        localStorage.setItem(CLIPS_HINT_KEY, '1');
      } catch { /* ignore */ }
    }
  }, [currentIndex, showSwipeHint]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted((prev) => {
      const next = !prev;
      localStorage.setItem('vybe-clips-muted', String(next));
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <AppLayout hideNav fullWidth noPadding>
        <div className="bg-black" style={{ height: containerHeight }}>
          <ClipsFeedHeader active={feedTab} onChange={handleFeedTabChange} />
          <ClipSkeleton />
        </div>
      </AppLayout>
    );
  }

  if (!shorts || shorts.length === 0) {
    return (
      <AppLayout hideNav fullWidth noPadding>
        <div
          className="flex items-center justify-center bg-black px-4"
          style={{ height: containerHeight }}
        >
          <ClipsFeedHeader active={feedTab} onChange={handleFeedTabChange} />
          <EmptyState
            emoji={feedTab === 'following' ? '👥' : '🎬'}
            title={feedTab === 'following' ? 'No clips from people you follow' : 'No clips yet'}
            description={
              feedTab === 'following'
                ? 'Follow creators to fill your Following feed'
                : 'Be the first to upload a clip'
            }
            actionLabel={feedTab === 'following' ? 'Discover creators' : 'Upload clip'}
            onAction={() => navigate(feedTab === 'following' ? '/explore' : '/upload')}
          />
        </div>
      </AppLayout>
    );
  }

  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;
  const cardProps = isMobileOrTablet
    ? { immersiveFlow: true as const }
    : {};

  return (
    <AppLayout hideNav fullWidth noPadding>
      <ClipsFeedHeader active={feedTab} onChange={handleFeedTabChange} />
      <div
        ref={containerRef}
        className="clips-scroll-container vybe-clips-feed overflow-y-scroll scrollbar-hide bg-black"
        style={{
          height: containerHeight,
          scrollSnapType: 'y mandatory',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollSnapStop: 'always',
          scrollBehavior: nativePerf ? 'auto' : 'smooth',
          touchAction: 'pan-y',
        }}
      >
        <div className="flex flex-col w-full">
          {shorts.map((short, index) => (
            <div
              key={`${feedTab}-${short.id}`}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="w-full flex-shrink-0 flex justify-center snap-start"
              style={{
                height: containerHeight,
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                contentVisibility: 'auto',
                containIntrinsicSize: `0 ${containerHeight}`,
              }}
            >
              <div className="relative h-full w-full max-w-full">
                <CardComponent
                  post={short}
                  isActive={index === currentIndex}
                  globalMuted={globalMuted}
                  onToggleMute={handleToggleMute}
                  {...cardProps}
                />
              </div>
            </div>
          ))}

          {hasNextPage && (
            <div
              ref={loadMoreRef}
              className="h-20 flex items-center justify-center bg-black snap-start"
            >
              {isFetchingNextPage && (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
            </div>
          )}
        </div>

        {!isMobileOrTablet && (
          <div className="fixed right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 pointer-events-none">
            {shorts.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, idx) => {
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

        {currentIndex === 0 && isMobileOrTablet && showSwipeHint && (
          <div
            className="fixed left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-pulse"
            style={{ bottom: CLIPS_BOTTOM_UI_OFFSET }}
          >
            <div className="text-white/70 text-sm flex flex-col items-center">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span className="font-medium">Swipe up for more</span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
