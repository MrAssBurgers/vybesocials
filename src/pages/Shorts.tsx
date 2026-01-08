import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function ShortsPage() {
  const { data: shorts, isLoading } = usePosts('short');
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const goToNext = useCallback(() => {
    if (shorts && currentIndex < shorts.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentIndex, shorts]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
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

  // Touch handling
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    const diff = touchStartY.current - touchEndY.current;
    const threshold = 50;

    if (diff > threshold) {
      goToNext();
    } else if (diff < -threshold) {
      goToPrev();
    }
  };

  // Mouse wheel handling
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      goToNext();
    } else if (e.deltaY < 0) {
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] md:h-screen flex items-center justify-center">
          <div className="gradient-animated rounded-full p-4 animate-pulse">
            <span className="text-4xl">😂</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!shorts || shorts.length === 0) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] md:h-screen flex flex-col items-center justify-center">
          <p className="text-6xl mb-4">🎬</p>
          <p className="text-xl text-muted-foreground">No shorts yet!</p>
          <p className="text-muted-foreground">Be the first to upload a short video.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div
        ref={containerRef}
        className="h-[calc(100vh-4rem)] md:h-screen overflow-hidden relative flex justify-center bg-background"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* TikTok-style container - 9:16 aspect ratio */}
        <div className="relative h-full w-full max-w-[calc((100vh-4rem)*9/16)] md:max-w-[calc(100vh*9/16)]">
        {/* Navigation hints */}
        <div className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-20 flex-col gap-2">
          <button
            onClick={goToPrev}
            disabled={currentIndex === 0}
            className="p-2 rounded-full bg-background/50 backdrop-blur-sm disabled:opacity-30 hover:bg-background/70 transition-colors"
          >
            <ChevronUp className="h-6 w-6" />
          </button>
          <button
            onClick={goToNext}
            disabled={currentIndex === shorts.length - 1}
            className="p-2 rounded-full bg-background/50 backdrop-blur-sm disabled:opacity-30 hover:bg-background/70 transition-colors"
          >
            <ChevronDown className="h-6 w-6" />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 hidden md:flex flex-col gap-1">
          {shorts.map((_, idx) => (
            <div
              key={idx}
              className={`w-1 h-6 rounded-full transition-all ${
                idx === currentIndex ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        {/* Shorts */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ duration: 0.3 }}
            className="h-full"
          >
            <ShortCard post={shorts[currentIndex]} isActive={true} />
          </motion.div>
        </AnimatePresence>

        {/* Swipe hint on mobile */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 md:hidden">
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-muted-foreground text-sm flex flex-col items-center"
          >
            <ChevronUp className="h-4 w-4" />
            <span>Swipe up</span>
          </motion.div>
        </div>
        </div>
      </div>
    </AppLayout>
  );
}
