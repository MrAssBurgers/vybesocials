import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePosts } from '@/hooks/usePosts';
import { ShortCard } from '@/components/posts/ShortCard';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChevronUp, ChevronDown } from 'lucide-react';

export default function ClipsPage() {
  const { data: shorts, isLoading } = usePosts('short');
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const isScrolling = useRef(false);
  const lastScrollTime = useRef(0);

  const goToNext = useCallback(() => {
    if (shorts && currentIndex < shorts.length - 1 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return; // Debounce
      lastScrollTime.current = now;
      isScrolling.current = true;
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => { isScrolling.current = false; }, 400);
    }
  }, [currentIndex, shorts]);

  const goToPrev = useCallback(() => {
    if (currentIndex > 0 && !isScrolling.current) {
      const now = Date.now();
      if (now - lastScrollTime.current < 300) return; // Debounce
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

  // Touch handling - TikTok style
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

  // Mouse wheel handling - TikTok style with snap
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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex items-center justify-center">
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
        <div className="h-[calc(100vh-4rem)] lg:h-screen flex flex-col items-center justify-center">
          <motion.p 
            className="text-6xl mb-4"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            🎬
          </motion.p>
          <p className="text-xl text-muted-foreground">No clips yet!</p>
          <p className="text-muted-foreground">Be the first to upload a clip.</p>
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
          {/* Navigation buttons - hidden on mobile */}
          <div className="hidden lg:flex absolute right-4 top-1/2 -translate-y-1/2 z-20 flex-col gap-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={goToPrev}
              disabled={currentIndex === 0}
              className="p-3 rounded-full liquid-glass disabled:opacity-30 hover:bg-white/20 transition-all"
            >
              <ChevronUp className="h-6 w-6 text-white" />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={goToNext}
              disabled={currentIndex === shorts.length - 1}
              className="p-3 rounded-full liquid-glass disabled:opacity-30 hover:bg-white/20 transition-all"
            >
              <ChevronDown className="h-6 w-6 text-white" />
            </motion.button>
          </div>

          {/* Progress indicator */}
          <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 hidden lg:flex flex-col gap-1">
            {shorts.slice(0, Math.min(shorts.length, 20)).map((_, idx) => (
              <motion.div
                key={idx}
                className={`w-1 rounded-full transition-all ${
                  idx === currentIndex ? 'h-8 bg-primary' : 'h-4 bg-white/30'
                }`}
                animate={idx === currentIndex ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.5 }}
              />
            ))}
          </div>

          {/* Clips with TikTok-style transitions */}
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
              />
            </motion.div>
          </AnimatePresence>

          {/* Swipe hint on mobile - fades out after first interaction */}
          <motion.div 
            className="absolute bottom-24 left-1/2 -translate-x-1/2 lg:hidden"
            initial={{ opacity: 1 }}
            animate={{ opacity: currentIndex > 0 ? 0 : 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-white/70 text-sm flex flex-col items-center"
            >
              <ChevronUp className="h-5 w-5" />
              <span className="font-medium">Swipe up</span>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </AppLayout>
  );
}
