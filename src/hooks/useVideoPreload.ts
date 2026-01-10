import { useEffect, useRef, useCallback } from 'react';

// Global cache for preloaded media
const preloadCache = new Set<string>();
const preloadingInProgress = new Set<string>();

/**
 * Smart video preload hook with network awareness
 * Only preloads metadata by default for bandwidth efficiency
 */
export function useVideoPreload(
  videoUrls: (string | null | undefined)[],
  options: {
    preloadDepth?: number;
    currentIndex?: number;
    enabled?: boolean;
  } = {}
) {
  const { preloadDepth = 2, currentIndex = 0, enabled = true } = options;
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect scrolling to pause preloading
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 100);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || isScrollingRef.current) return;

    // Only preload items around current index
    const start = currentIndex;
    const end = Math.min(currentIndex + preloadDepth + 1, videoUrls.length);

    for (let i = start; i < end; i++) {
      const url = videoUrls[i];
      if (!url || preloadCache.has(url) || preloadingInProgress.has(url)) continue;

      preloadingInProgress.add(url);

      // Use requestIdleCallback for non-blocking preload
      const preloadFn = () => {
        preloadVideoMetadata(url)
          .then(() => {
            preloadCache.add(url);
            preloadingInProgress.delete(url);
          })
          .catch(() => {
            preloadingInProgress.delete(url);
          });
      };

      if ('requestIdleCallback' in window) {
        requestIdleCallback(preloadFn, { timeout: 3000 });
      } else {
        setTimeout(preloadFn, 50 * (i - currentIndex));
      }
    }
  }, [videoUrls, currentIndex, preloadDepth, enabled]);

  return { preloadedCount: preloadCache.size };
}

/**
 * Preload video metadata only (fast, low bandwidth)
 */
export function preloadVideoMetadata(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      video.src = ''; // Release resource
      resolve();
    };
    video.onerror = () => {
      video.src = '';
      reject();
    };
    // Timeout fallback
    setTimeout(() => {
      video.src = '';
      resolve();
    }, 5000);
  });
}

/**
 * Preload full video (use sparingly - for current/next clip only)
 */
export function preloadVideo(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.oncanplaythrough = () => resolve();
    video.onerror = reject;
    // Timeout fallback
    setTimeout(resolve, 10000);
  });
}

/**
 * Preload an image
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
 * Clear preload cache (useful for memory management)
 */
export function clearPreloadCache() {
  preloadCache.clear();
  preloadingInProgress.clear();
}
