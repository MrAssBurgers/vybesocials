import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInfinitePosts } from '@/hooks/useInfinitePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';
import { useInView } from 'react-intersection-observer';
import { Home, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useVideoPreload } from '@/hooks/useVideoPreload';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function ClipsPage() {
  const { 
    data, 
    isLoading, 
    fetchNextPage, 
    hasNextPage, 
    isFetchingNextPage 
  } = useInfinitePosts('short');
  
  const shorts = useMemo(() => data?.pages.flatMap(page => page.posts) || [], [data]);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { isSlowConnection } = useNetworkStatus();
  
  // Smart preload videos around current position
  const videoUrls = useMemo(() => shorts.map(s => s.media_url), [shorts]);
  useVideoPreload(videoUrls, { 
    currentIndex, 
    preloadDepth: isSlowConnection ? 1 : 2,
    enabled: !isScrolling 
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

  // Detect which clip is in view using IntersectionObserver
  // Also track scrolling state to reduce animations during scroll
  useEffect(() => {
    if (!shorts?.length) return;

    const observer = new IntersectionObserver(
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
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [shorts, currentIndex]);

  // Track scrolling to reduce effects during scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        scrollToIndex(currentIndex + 1);
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        scrollToIndex(currentIndex - 1);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, shorts?.length]);

  const scrollToIndex = useCallback((index: number) => {
    if (!shorts || index < 0 || index >= shorts.length) return;
    const target = itemRefs.current[index];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [shorts]);

  // Touch handling for press-and-hold to pause
  const handleTouchStart = useCallback(() => {
    holdTimer.current = setTimeout(() => {
      setIsPaused(true);
    }, 200);
  }, []);

  const handleTouchMove = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (isPaused) {
      setIsPaused(false);
    }
  }, [isPaused]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => !prev);
  }, []);

  if (isLoading) {
    return (
      <AppLayout hideNav>
        <div className="h-dvh flex items-center justify-center bg-black">
          <motion.div 
            className="gradient-animated rounded-full p-4"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <span className="text-4xl">🎬</span>
          </motion.div>
        </div>
      </AppLayout>
    );
  }

  if (!shorts || shorts.length === 0) {
    return (
      <AppLayout hideNav>
        <div className="h-dvh flex items-center justify-center bg-black px-4">
          <EmptyState
            emoji="🎬"
            title="No clips yet"
            description="Be the first to upload a clip"
            actionLabel="Upload Clip"
            onAction={() => window.location.href = '/upload'}
          />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideNav>
      <div
        ref={containerRef}
        className="h-dvh overflow-y-scroll scrollbar-hide bg-black"
        style={{ 
          scrollSnapType: 'y mandatory',
          scrollBehavior: 'smooth',
          overscrollBehavior: 'none',
          WebkitOverflowScrolling: 'touch',
          // TikTok-like scroll physics
          scrollSnapStop: 'always',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* TikTok-style vertical scroll container */}
        <div className="flex flex-col w-full">
          {shorts.map((short, index) => (
            <div
              key={short.id}
              ref={(el) => { itemRefs.current[index] = el; }}
              className="h-dvh w-full flex-shrink-0 flex justify-center"
              style={{ 
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
              }}
            >
              {/* Full screen container */}
              <div className="relative h-full w-full max-w-[500px]">
                <ShortCard 
                  post={short} 
                  isActive={index === currentIndex && !isPaused}
                  globalMuted={globalMuted}
                  onToggleMute={handleToggleMute}
                  isHolding={isPaused && index === currentIndex}
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
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full"
                />
              )}
            </div>
          )}
        </div>

        {/* Navigation button - always visible */}
        <Link 
          to="/home"
          className="fixed top-4 left-4 z-30 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 hover:bg-black/60 transition-colors"
        >
          <X className="w-5 h-5 text-white" />
        </Link>

        {/* Progress indicator */}
        <div className="fixed right-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 pointer-events-none">
          {shorts.slice(Math.max(0, currentIndex - 3), currentIndex + 4).map((_, idx) => {
            const actualIdx = Math.max(0, currentIndex - 3) + idx;
            return (
              <motion.div
                key={actualIdx}
                className="w-1 rounded-full bg-white"
                animate={{
                  height: actualIdx === currentIndex ? 20 : 6,
                  opacity: actualIdx === currentIndex ? 1 : 0.3,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              />
            );
          })}
        </div>

        {/* Pause indicator */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="fixed inset-0 flex items-center justify-center pointer-events-none z-30"
            >
              <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                <div className="flex gap-2">
                  <div className="w-3 h-10 bg-white rounded-sm" />
                  <div className="w-3 h-10 bg-white rounded-sm" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Swipe hint - first clip only */}
        {currentIndex === 0 && (
          <motion.div 
            className="fixed bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-20"
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{ delay: 2.5, duration: 0.8 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.2, repeat: 2 }}
              className="text-white/70 text-sm flex flex-col items-center"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
              <span className="font-medium">Swipe up</span>
            </motion.div>
          </motion.div>
        )}
      </div>
    </AppLayout>
  );
}
