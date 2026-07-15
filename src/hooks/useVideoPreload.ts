import { useEffect, useRef, useCallback } from 'react';
import { shouldPreloadMediaUrl, normalizeMediaUrl } from '@/lib/mediaUrl';

// Global cache for preloaded media
const preloadCache = new Set<string>();
const preloadingInProgress = new Set<string>();
const createdElements: HTMLVideoElement[] = [];

// Limit concurrent preloads to prevent iOS freezing
const MAX_CONCURRENT_PRELOADS = 3;

// Detect iOS/iPadOS - needs more conservative preloading
const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

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
    
    // On iOS, disable preloading entirely to prevent freezing
    if (isIOSDevice()) return;
    
    // Limit concurrent preloads
    if (preloadingInProgress.size >= MAX_CONCURRENT_PRELOADS) return;

    // Only preload items around current index
    const start = currentIndex;
    const end = Math.min(currentIndex + preloadDepth, videoUrls.length);

    for (let i = start; i < end; i++) {
      const url = normalizeMediaUrl(videoUrls[i]);
      if (!url || !shouldPreloadMediaUrl(url) || preloadCache.has(url) || preloadingInProgress.has(url)) continue;
      if (preloadingInProgress.size >= MAX_CONCURRENT_PRELOADS) break;

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

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(preloadFn, { timeout: 3000 });
      } else {
        window.setTimeout(preloadFn, 50 * (i - currentIndex));
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
    // Skip on iOS to prevent memory issues
    if (isIOSDevice()) {
      resolve();
      return;
    }
    
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    
    // Track element for cleanup
    createdElements.push(video);
    
    const cleanup = () => {
      video.src = '';
      video.load(); // Force release of resources
      const idx = createdElements.indexOf(video);
      if (idx > -1) createdElements.splice(idx, 1);
    };
    
    video.onloadedmetadata = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject();
    };
    // Timeout fallback
    setTimeout(() => {
      cleanup();
      resolve();
    }, 3000);
  });
}

/**
 * Preload full video - DISABLED on iOS to prevent freezing
 */
export function preloadVideo(url: string): Promise<void> {
  // Skip entirely on iOS - causes freezing
  if (isIOSDevice()) {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    
    createdElements.push(video);
    
    const cleanup = () => {
      video.src = '';
      video.load();
      const idx = createdElements.indexOf(video);
      if (idx > -1) createdElements.splice(idx, 1);
    };
    
    video.oncanplaythrough = () => {
      cleanup();
      resolve();
    };
    video.onerror = () => {
      cleanup();
      reject();
    };
    // Shorter timeout
    setTimeout(() => {
      cleanup();
      resolve();
    }, 5000);
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
  
  // Clean up any lingering video elements
  createdElements.forEach(video => {
    video.src = '';
    video.load();
  });
  createdElements.length = 0;
}
