import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { EmptyState } from '@/components/ui/EmptyState';

export default function ClipsPage() {
  const { data: shorts, isLoading } = usePosts('short');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);
  const isScrolling = useRef(false);
  const lastScrollTime = useRef(0);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);

  const goToNext = useCallback(() => {
    if (shorts && currentIndex < shorts.length - 1 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 350) return;
      lastScrollTime.current = now;
      isScrolling.current = true;
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [currentIndex, shorts]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 350) return;
      lastScrollTime.current = now;
      isScrolling.current = true;
      setCurrentIndex(prev => prev - 1);
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') goToNext();
      else if (e.key === 'ArrowUp' || e.key === 'k') goToPrev();
      else if (e.key === ' ') {
        e.preventDefault();
        setIsPaused(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  // Touch handling - swipe with snap, press-and-hold to pause
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    
    // Start hold timer for pause
    holdTimer.current = setTimeout(() => {
      setIsPaused(true);
    }, 200);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Cancel hold if user is swiping
    const diff = Math.abs(e.touches[0].clientY - touchStartY.current);
    if (diff > 10 && holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    // Clear hold timer
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    
    // Resume if was paused by hold
    if (isPaused) {
      setIsPaused(false);
      return;
    }
    
    const touchEndY = e.changedTouches[0].clientY;
    const diff = touchStartY.current - touchEndY;
    const timeDiff = Date.now() - touchStartTime.current;
    const threshold = 50;
    const velocity = Math.abs(diff) / timeDiff;

    // Swipe detection with velocity
    if (Math.abs(diff) > threshold || velocity > 0.3) {
      if (diff > 0) goToNext();
      else goToPrev();
    }
  };

  // Mouse wheel handling with debounce
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (Math.abs(e.deltaY) > 30) {
      if (e.deltaY > 0) goToNext();
      else goToPrev();
    }
  }, [goToNext, goToPrev]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => !prev);
  }, []);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex items-center justify-center bg-black">
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
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex items-center justify-center bg-black px-4">
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
    <AppLayout>
      <div
        ref={containerRef}
        className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden relative flex justify-center bg-black touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* TikTok-style container - 9:16 aspect ratio */}
        <div className="relative h-full w-full max-w-[calc((100vh-4rem)*9/16)] lg:max-w-[calc(100vh*9/16)]">
          {/* Minimal progress dots */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
            {shorts.slice(0, Math.min(shorts.length, 8)).map((_, idx) => (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'h-6 bg-white' : 'h-2 bg-white/30'
                }`}
              />
            ))}
            {shorts.length > 8 && (
              <div className="w-1 h-1 rounded-full bg-white/30" />
            )}
          </div>

          {/* Clips with snap transitions */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={currentIndex}
              initial={{ y: '100%', opacity: 0.8 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0.8 }}
              transition={{ 
                type: 'spring', 
                stiffness: 350, 
                damping: 35,
                mass: 0.8
              }}
              className="h-full absolute inset-0"
            >
              <ShortCard 
                post={shorts[currentIndex]} 
                isActive={!isPaused}
                globalMuted={globalMuted}
                onToggleMute={handleToggleMute}
                isHolding={isPaused}
              />
            </motion.div>
          </AnimatePresence>

          {/* Pause indicator */}
          <AnimatePresence>
            {isPaused && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
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
              className="absolute bottom-24 left-1/2 -translate-x-1/2 lg:hidden pointer-events-none"
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
      </div>
    </AppLayout>
  );
}
