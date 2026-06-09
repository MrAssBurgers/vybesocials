import { useEffect, useRef, useCallback } from 'react';
import { useNetworkStatus } from './useNetworkStatus';
import { shouldPreloadMediaUrl } from '@/lib/mediaUrl';

interface PreloadConfig {
  /** URLs to preload */
  urls: (string | null | undefined)[];
  /** Number of items ahead to preload */
  preloadAhead?: number;
  /** Current index in list */
  currentIndex?: number;
  /** Is preloading enabled */
  enabled?: boolean;
}

/**
 * Smart preloading hook that adapts to network conditions
 * Preloads images and video metadata for faster loading
 */
export function useSmartPreload({ 
  urls, 
  preloadAhead = 2, 
  currentIndex = 0,
  enabled = true 
}: PreloadConfig) {
  const { isSlowConnection, saveData, isOnline } = useNetworkStatus();
  const preloadedUrls = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect rapid scrolling to pause preloading
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Preload function
  const preload = useCallback((url: string) => {
    if (!shouldPreloadMediaUrl(url) || preloadedUrls.current.has(url)) return;

    preloadedUrls.current.add(url);

    const isVideo = /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url);

    if (isVideo) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.src = url;
      video.onerror = () => {
        preloadedUrls.current.delete(url);
      };
    } else {
      const img = new Image();
      img.src = url;
      img.onerror = () => {
        preloadedUrls.current.delete(url);
      };
    }
  }, []);

  // Preload URLs based on current position
  useEffect(() => {
    // Skip if disabled, offline, or rapid scrolling
    if (!enabled || !isOnline || isScrollingRef.current) return;
    
    // Reduce preload depth on slow connections
    const effectivePreloadAhead = isSlowConnection || saveData 
      ? Math.min(1, preloadAhead) 
      : preloadAhead;
    
    // Cancel any pending preloads
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Preload items ahead of current position
    const startIndex = currentIndex;
    const endIndex = Math.min(currentIndex + effectivePreloadAhead + 1, urls.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      const url = urls[i];
      if (url && typeof url === 'string' && shouldPreloadMediaUrl(url)) {
        // Use requestIdleCallback for non-blocking preload
        if ('requestIdleCallback' in window) {
          requestIdleCallback(() => preload(url), { timeout: 2000 });
        } else {
          setTimeout(() => preload(url), 100 * (i - currentIndex));
        }
      }
    }
  }, [urls, currentIndex, preloadAhead, enabled, isSlowConnection, saveData, isOnline, preload]);

  return {
    preloadedCount: preloadedUrls.current.size,
    isPreloading: !isScrollingRef.current && enabled && isOnline,
  };
}

/**
 * Preload a single image with a promise
 */
export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve();
    img.onerror = reject;
  });
}

/**
 * Preload video metadata only (fast, low bandwidth)
 */
export function preloadVideoMetadata(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.src = url;
    video.onloadedmetadata = () => resolve();
    video.onerror = reject;
  });
}

/**
 * Hook for lazy loading with intersection observer
 */
export function useLazyLoad(threshold = 0.1, rootMargin = '200px') {
  const elementRef = useRef<HTMLElement | null>(null);
  const isVisibleRef = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { elementRef, isVisible: isVisibleRef.current };
}
