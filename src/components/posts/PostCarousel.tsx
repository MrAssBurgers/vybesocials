import { useState, useCallback, useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useFastSignedUrl } from '@/hooks/useFastSignedUrl';
import { MediaFallback } from '@/components/ui/MediaFallback';

interface PostCarouselProps {
  urls: string[];
  onDoubleTap?: () => void;
}

function CarouselImage({ url }: { url: string }) {
  const signedUrl = useFastSignedUrl(url);
  const [hasError, setHasError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (hasError) return <MediaFallback />;

  return (
    <div className="relative w-full aspect-square bg-muted/20">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-muted/30" />
      )}
      <img
        src={signedUrl || ''}
        alt=""
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0"
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setHasError(true)}
        loading="lazy"
      />
    </div>
  );
}

export function PostCarousel({ urls, onDoubleTap }: PostCarouselProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragX = useMotionValue(0);

  const goTo = useCallback((index: number, dir: number) => {
    const clamped = Math.max(0, Math.min(urls.length - 1, index));
    if (clamped !== current) {
      setDirection(dir);
      setCurrent(clamped);
    }
  }, [urls.length, current]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    // Only track horizontal swipes
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
      isDragging.current = true;
      dragX.set(dx);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < urls.length - 1) goTo(current + 1, 1);
      if (diff < 0 && current > 0) goTo(current - 1, -1);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    animate(dragX, 0, { type: 'spring', stiffness: 400, damping: 30 });
  };

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0.5 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0.5 }),
  };

  return (
    <div
      className="relative w-full overflow-hidden group"
      onDoubleClick={onDoubleTap}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides with spring physics */}
      <div className="relative w-full aspect-square">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={current}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 260, damping: 24 },
              opacity: { duration: 0.2 },
            }}
            className="absolute inset-0"
          >
            <CarouselImage url={urls[current]} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation arrows with glass effect */}
      {urls.length > 1 && (
        <>
          {current > 0 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(e) => { e.stopPropagation(); goTo(current - 1, -1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg backdrop-blur-xl border border-border/20"
              style={{ backgroundColor: 'hsl(var(--background) / 0.6)' }}
            >
              <ChevronLeft className="h-4 w-4 text-foreground" />
            </motion.button>
          )}
          {current < urls.length - 1 && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={(e) => { e.stopPropagation(); goTo(current + 1, 1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg backdrop-blur-xl border border-border/20"
              style={{ backgroundColor: 'hsl(var(--background) / 0.6)' }}
            >
              <ChevronRight className="h-4 w-4 text-foreground" />
            </motion.button>
          )}
        </>
      )}

      {/* Glowing animated dots */}
      {urls.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full backdrop-blur-xl border border-border/10" style={{ backgroundColor: 'hsl(var(--background) / 0.4)' }}>
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i, i > current ? 1 : -1); }}
              className="relative"
            >
              <motion.div
                className={cn(
                  "rounded-full transition-colors duration-300",
                  i === current ? "bg-primary" : "bg-foreground/30"
                )}
                animate={{
                  width: i === current ? 8 : 6,
                  height: i === current ? 8 : 6,
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              />
              {/* Glow effect on active dot */}
              {i === current && (
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/40"
                  initial={{ scale: 1, opacity: 0.6 }}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ filter: 'blur(3px)' }}
                />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Counter badge with glass */}
      {urls.length > 1 && (
        <div
          className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-xs font-medium border border-border/10 backdrop-blur-xl"
          style={{ backgroundColor: 'hsl(var(--background) / 0.5)', color: 'hsl(var(--foreground) / 0.8)' }}
        >
          {current + 1}/{urls.length}
        </div>
      )}
    </div>
  );
}
