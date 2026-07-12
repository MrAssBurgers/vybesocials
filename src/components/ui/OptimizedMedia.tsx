import { useState, useRef, useEffect, useCallback, memo, forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { MediaFallback, MediaSkeleton } from './MediaFallback';

interface OptimizedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string | null | undefined;
  thumbnailSrc?: string;
  caption?: string;
  priority?: boolean; // Above the fold - load immediately
  aspectRatio?: 'square' | 'video' | 'auto';
}

/**
 * Optimized image component with:
 * - Blur-up placeholder effect
 * - Lazy loading for offscreen
 * - Priority loading for above-fold
 * - Network-aware quality
 */
export const OptimizedImage = memo(forwardRef<HTMLImageElement, OptimizedImageProps>(
  function OptimizedImage({ 
    src, 
    thumbnailSrc,
    caption,
    priority = false,
    aspectRatio = 'auto',
    className,
    alt,
    ...props 
  }, ref) {
    const [isLoaded, setIsLoaded] = useState(priority);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(priority);
    const containerRef = useRef<HTMLDivElement>(null);
    const signedUrl = useSignedUrl(src);
    const { isSlowConnection } = useNetworkStatus();

    // Intersection observer for lazy loading
    useEffect(() => {
      if (priority || isInView) return;
      
      const element = containerRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        },
        { rootMargin: '400px', threshold: 0.01 }
      );

      observer.observe(element);
      return () => observer.disconnect();
    }, [priority, isInView]);

    const handleLoad = useCallback(() => {
      setIsLoaded(true);
      setHasError(false);
    }, []);

    const handleError = useCallback(() => {
      setIsLoaded(true);
      setHasError(true);
    }, []);

    if (!src) {
      return <MediaFallback type="image" caption={caption} className={className} />;
    }

    if (hasError) {
      return <MediaFallback type="image" caption={caption} className={className} />;
    }

    const aspectClass = aspectRatio === 'square' 
      ? 'aspect-square' 
      : aspectRatio === 'video' 
        ? 'aspect-video' 
        : '';

    return (
      <div ref={containerRef} className={cn("relative overflow-hidden", aspectClass, className)}>
        {/* Blur placeholder - always visible until loaded */}
        {!isLoaded && !priority && (
          <div className="absolute inset-0 media-shimmer bg-gradient-to-r from-muted via-muted-foreground/10 to-muted" />
        )}
        
        {/* Thumbnail blur-up (if provided) */}
        {thumbnailSrc && !isLoaded && (
          <img
            src={thumbnailSrc}
            alt=""
            className="absolute inset-0 w-full h-full object-cover blur-lg scale-110 opacity-50"
            aria-hidden="true"
          />
        )}
        
        {/* Main image - only load when in view */}
        {(isInView || priority) && (
          <img 
            ref={ref}
            src={signedUrl || src} 
            className={cn(
              "w-full h-full object-cover",
              !priority && !isLoaded && "opacity-0",
              (priority || isLoaded) && "opacity-100",
            )} 
            alt={alt || caption || ''}
            onLoad={handleLoad}
            onError={handleError}
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            fetchPriority={priority ? 'high' : 'auto'}
            {...props} 
          />
        )}
      </div>
    );
  }
));

interface OptimizedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string | null | undefined;
  posterSrc?: string;
  caption?: string;
  priority?: boolean;
  preloadStrategy?: 'none' | 'metadata' | 'auto';
  onVisibilityChange?: (isVisible: boolean) => void;
}

/**
 * Optimized video component with:
 * - Poster/thumbnail immediately shown
 * - Smart preloading based on position
 * - Network-aware buffering
 * - Visibility-based playback control
 */
export const OptimizedVideo = memo(forwardRef<HTMLVideoElement, OptimizedVideoProps>(
  function OptimizedVideo({ 
    src, 
    posterSrc,
    caption,
    priority = false,
    preloadStrategy = 'metadata',
    onVisibilityChange,
    className,
    ...props 
  }, ref) {
    const [isLoaded, setIsLoaded] = useState(priority);
    const [hasError, setHasError] = useState(false);
    const [isInView, setIsInView] = useState(priority);
    const containerRef = useRef<HTMLDivElement>(null);
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const videoRef = (ref as React.RefObject<HTMLVideoElement>) || internalVideoRef;
    const signedUrl = useSignedUrl(src);
    const { isSlowConnection, saveData } = useNetworkStatus();

    // Determine preload strategy based on network
    const effectivePreload = isSlowConnection || saveData 
      ? 'none' 
      : priority 
        ? 'auto' 
        : preloadStrategy;

    // Intersection observer for visibility tracking
    useEffect(() => {
      const element = containerRef.current;
      if (!element) return;

      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          setIsInView(visible);
          onVisibilityChange?.(visible);
          
          // Auto pause/play based on visibility
          const video = videoRef.current;
          if (video) {
            if (!visible && !video.paused) {
              video.pause();
            }
          }
        },
        { rootMargin: '400px', threshold: 0.01 }
      );

      observer.observe(element);
      return () => observer.disconnect();
    }, [onVisibilityChange, videoRef]);

    const handleLoadedData = useCallback(() => {
      setIsLoaded(true);
      setHasError(false);
    }, []);

    const handleError = useCallback(() => {
      setIsLoaded(true);
      setHasError(true);
    }, []);

    if (!src) {
      return <MediaFallback type="video" caption={caption} className={className} />;
    }

    if (hasError) {
      return <MediaFallback type="video" caption={caption} className={className} />;
    }

    return (
      <div ref={containerRef} className={cn("relative overflow-hidden", className)}>
        {/* Poster/placeholder - always visible until video loads */}
        {!isLoaded && (
          <>
            {posterSrc ? (
              <img
                src={posterSrc}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
                aria-hidden="true"
              />
            ) : (
              <MediaSkeleton className="absolute inset-0" />
            )}
          </>
        )}
        
        {/* Video - only load source when in view or priority */}
        <video 
          ref={videoRef}
          src={isInView || priority ? (signedUrl || src) : undefined}
          poster={posterSrc}
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            isLoaded ? "opacity-100" : "opacity-0"
          )} 
          onLoadedData={handleLoadedData}
          onError={handleError}
          preload={effectivePreload}
          playsInline
          {...props} 
        />
      </div>
    );
  }
));

/**
 * Hook for optimized feed rendering
 * Returns only items that should be rendered based on viewport
 */
export function useVirtualizedFeed<T extends { id: string }>(
  items: T[],
  options: {
    overscan?: number;
    estimatedItemHeight?: number;
  } = {}
) {
  const { overscan = 3, estimatedItemHeight = 500 } = options;
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: overscan });

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const viewportHeight = window.innerHeight;
      
      const start = Math.max(0, Math.floor(scrollTop / estimatedItemHeight) - overscan);
      const end = Math.min(
        items.length,
        Math.ceil((scrollTop + viewportHeight) / estimatedItemHeight) + overscan
      );
      
      setVisibleRange({ start, end });
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [items.length, estimatedItemHeight, overscan]);

  return {
    visibleItems: items.slice(visibleRange.start, visibleRange.end),
    startIndex: visibleRange.start,
    totalHeight: items.length * estimatedItemHeight,
    offsetTop: visibleRange.start * estimatedItemHeight,
  };
}
