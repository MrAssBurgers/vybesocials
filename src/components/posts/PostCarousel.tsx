import { useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const goTo = useCallback((index: number) => {
    setCurrent(Math.max(0, Math.min(urls.length - 1, index)));
  }, [urls.length]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && current < urls.length - 1) goTo(current + 1);
      if (diff < 0 && current > 0) goTo(current - 1);
    }
    setTouchStart(null);
  };

  return (
    <div
      className="relative w-full overflow-hidden group"
      onDoubleClick={onDoubleTap}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Slides */}
      <div
        className="flex transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {urls.map((url, i) => (
          <div key={i} className="w-full flex-shrink-0">
            <CarouselImage url={url} />
          </div>
        ))}
      </div>

      {/* Navigation arrows */}
      {urls.length > 1 && (
        <>
          {current > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(current - 1); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-border/30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {current < urls.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(current + 1); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg border border-border/30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      {/* Dots indicator */}
      {urls.length > 1 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {urls.map((_, i) => (
            <button
              key={i}
              onClick={(e) => { e.stopPropagation(); goTo(i); }}
              className={cn(
                "rounded-full transition-all duration-200",
                i === current
                  ? "w-2 h-2 bg-primary shadow-lg shadow-primary/50"
                  : "w-1.5 h-1.5 bg-foreground/40 hover:bg-foreground/60"
              )}
            />
          ))}
        </div>
      )}

      {/* Counter badge */}
      {urls.length > 1 && (
        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-background/70 backdrop-blur-sm text-xs font-medium text-foreground/80 border border-border/20">
          {current + 1}/{urls.length}
        </div>
      )}
    </div>
  );
}
