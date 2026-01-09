import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { AppLayout } from '@/components/layout/AppLayout';

export default function ClipsPage() {
  const { data: shorts, isLoading } = usePosts('short');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [globalMuted, setGlobalMuted] = useState(true); // Start muted by default
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const isScrolling = useRef(false);
  const lastScrollTime = useRef(0);
  const isHolding = useRef(false);

  const goToNext = useCallback(() => {
    if (shorts && currentIndex < shorts.length - 1 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return;
      lastScrollTime.current = now;
      isScrolling.current = true;
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [currentIndex, shorts]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return;
      lastScrollTime.current = now;
      isScrolling.current = true;
      setCurrentIndex(prev => prev - 1);
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'j') {
        goToNext();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        goToPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  // Touch handling - swipe only, no tap conflicts
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isHolding.current = true;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    isHolding.current = false;
    const diff = touchStartY.current - touchEndY.current;
    const threshold = 50;

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        goToNext();
      } else {
        goToPrev();
      }
    }
  };

  // Mouse wheel handling - smooth scroll between clips
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 30) {
      goToNext();
    } else if (e.deltaY < -30) {
      goToPrev();
    }
  }, [goToNext, goToPrev]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

// Tap to toggle mute handler (passed to ShortCard)
  const handleToggleMute = useCallback(() => {
    setGlobalMuted(prev => !prev);
  }, []);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex items-center justify-center bg-black">
          <motion.div 
            className="gradient-animated rounded-full p-4"
            animate={{ scale: [1, 1.2, 1], rotate: [0, 180, 360] }}
            transition={{ duration: 2, repeat: Infinity }}
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
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col items-center justify-center bg-black">
          <motion.p 
            className="text-6xl mb-4"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🎬
          </motion.p>
          <p className="text-xl text-white/80">No clips yet!</p>
          <p className="text-white/60">Be the first to upload a clip.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div
        ref={containerRef}
        className="h-[calc(100vh-4rem)] lg:h-screen overflow-hidden relative flex justify-center bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* TikTok-style container - 9:16 aspect ratio */}
        <div className="relative h-full w-full max-w-[calc((100vh-4rem)*9/16)] lg:max-w-[calc(100vh*9/16)]">
          {/* Progress indicator - minimal dots on left */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1">
            {shorts.slice(0, Math.min(shorts.length, 10)).map((_, idx) => (
              <div
                key={idx}
                className={`w-1 rounded-full transition-all duration-300 ${
                  idx === currentIndex ? 'h-6 bg-white' : 'h-2 bg-white/30'
                }`}
              />
            ))}
          </div>

          {/* Clips with smooth transitions */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={currentIndex}
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '-100%', opacity: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 300, 
                damping: 30,
                mass: 0.8
              }}
              className="h-full absolute inset-0"
            >
              <ShortCard 
                post={shorts[currentIndex]} 
                isActive={true}
                globalMuted={globalMuted}
                onToggleMute={handleToggleMute}
                isHolding={isHolding.current}
              />
            </motion.div>
          </AnimatePresence>

          {/* Swipe hint on mobile - only for first clip */}
          {currentIndex === 0 && (
            <motion.div 
              className="absolute bottom-24 left-1/2 -translate-x-1/2 lg:hidden pointer-events-none"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              transition={{ delay: 3, duration: 1 }}
            >
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 1.5, repeat: 3 }}
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
