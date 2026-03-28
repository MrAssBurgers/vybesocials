import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { usePersonalizedFeed } from '@/hooks/useInfinitePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { MobileShortCard } from '@/components/posts/MobileShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { ClipSkeleton } from '@/components/clips/ClipSkeleton';
import { useInView } from 'react-intersection-observer';
import { X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useIsMobileOrTablet } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

// Bottom nav height - accounts for safe area on all devices
const BOTTOM_NAV_HEIGHT = 80; // px (including safe area padding)

export default function ClipsPage() {
  const navigate = useNavigate();
  const { 
    data, 
    isLoading, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = usePersonalizedFeed('short');
  
  // Stable session-seeded shuffle - prevents re-ordering on every re-render
  const sessionSeed = useMemo(() => Math.random(), []);
  const shorts = useMemo(() => {
    const allPosts = data?.pages.flatMap(page => page.posts) || [];
    if (allPosts.length === 0) return [];
    // Seeded shuffle for stable ordering within a session
    const shuffled = [...allPosts];
    let seed = sessionSeed;
    const seededRandom = () => {
      seed = (seed * 16807 + 0.5) % 1;
      return Math.abs(seed);
    };
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, [data, sessionSeed]);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(() => {
    const stored = localStorage.getItem('vybe-clips-muted');
    return stored !== null ? stored === 'true' : true;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const observerRef = useRef<IntersectionObserver | null>(null);
  
  // Use isMobileOrTablet to properly detect iPads in any orientation
  const { isMobileOrTablet, isIPad } = useIsMobileOrTablet();
  const { isSlowConnection } = useNetworkStatus();
  
  // Smart preload videos around current position - preload next 5 for instant scrolling
  const videoUrls = useMemo(() => shorts.map(s => s.media_url), [shorts]);
  useVideoPreload(videoUrls, { 
    currentIndex, 
    preloadDepth: isSlowConnection ? 2 : 5,
    enabled: !isSlowConnection 
  });

  // Infinite scroll trigger
  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '200px',
  });

  // Fetch next page when approaching end
  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Simplified IntersectionObserver for mobile - reduces jank
  useEffect(() => {
    if (!shorts?.length) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const index = itemRefs.current.findIndex((ref) => ref === entry.target);
            if (index !== -1 && index !== currentIndex) {
              setCurrentIndex(index);
            }
          }
        });
      },
      {
        root: containerRef.current,
        threshold: 0.6,
      }
    );

    itemRefs.current.forEach((ref) => {
      if (ref) observerRef.current?.observe(ref);
    });

    return () => {
      observerRef.current?.disconnect();
    };
  }, [shorts?.length, currentIndex]);

  // Keyboard navigation (desktop only)
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

  const scrollToIndex = useCallback((index: number) => {
    if (!shorts || index < 0 || index >= shorts.length) return;
    const target = itemRefs.current[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [shorts]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => {
      const next = !prev;
      localStorage.setItem('vybe-clips-muted', String(next));
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <AppLayout hideNav>
        <div 
          className="flex items-center justify-center bg-black"
          style={{ height: isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh' }}
        >
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!shorts || shorts.length === 0) {
    return (
      <AppLayout hideNav>
        <div 
          className="flex items-center justify-center bg-black px-4"
          style={{ height: isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh' }}
        >
          <EmptyState
            emoji="🎬"
            title="No clips yet"
            description="Be the first to upload a clip"
            actionLabel="Upload Clip"
            onAction={() => navigate('/upload')}
          />
        </div>
      </AppLayout>
    );
  }

  // Calculate container height - on mobile/tablet leave room for bottom nav
  const containerHeight = isMobileOrTablet ? `calc(100dvh - ${BOTTOM_NAV_HEIGHT}px)` : '100dvh';

  // Use simplified card on mobile/iPad to prevent freezing
  const CardComponent = isMobileOrTablet ? MobileShortCard : ShortCard;

  return (
    <AppLayout hideNav>
      <div
        ref={containerRef}
        className="overflow-y-scroll scrollbar-hide bg-black"
        style={{ 
          height: containerHeight,
          scrollSnapType: 'y mandatory',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
          scrollSnapStop: 'always',
          scrollBehavior: 'smooth',
          touchAction: 'pan-y',
        }}
      >
        {/* TikTok-style vertical scroll container */}
        <div className="flex flex-col w-full">
          {shorts.map((short, index) => (
            <div
              key={short.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="w-full flex-shrink-0 flex justify-center"
              style={{ 
                height: containerHeight,
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              {/* Full screen container - responsive max-width for different devices */}
              <div className={cn(
                "relative h-full w-full",
                // Mobile: full width, Tablet/iPad: constrained for better UX
                "max-w-full sm:max-w-[480px] md:max-w-[420px] lg:max-w-[400px]"
              )}>
                <CardComponent 
                  post={short} 
                  isActive={index === currentIndex}
                  globalMuted={globalMuted}
                  onToggleMute={handleToggleMute}
                />
              </div>
            </div>
          ))}
          
          {/* Infinite scroll trigger */}
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

        {/* Navigation button - always visible */}
        <Link 
          to="/home"
          className="fixed top-4 left-4 z-30 w-11 h-11 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20 active:bg-black/70 transition-colors shadow-lg"
        >
          <X className="w-6 h-6 text-white" strokeWidth={2.5} />
        </Link>

        {/* Progress indicator - simplified for mobile */}
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

        {/* Swipe hint - first clip only on mobile */}
        {currentIndex === 0 && isMobileOrTablet && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20 animate-pulse">
            <div className="text-white/70 text-sm flex flex-col items-center">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span className="font-medium">Swipe up</span>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
