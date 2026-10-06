import { useEffect, useRef } from 'react';
import { preloadDetachedVideo, cancelDetachedVideoPreloads } from '@/lib/detachedVideoPreload';
import { shouldPreloadMediaUrl, normalizeMediaUrl } from '@/lib/mediaUrl';

// Global cache for preloaded media
const preloadCache = new Set<string>();
const preloadingInProgress = new Map<string, symbol>();
let cacheGeneration = 0;

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

    const controller = new AbortController();
    const owner = Symbol('preload-window');
    const generation = cacheGeneration;
    const scheduled: Array<() => void> = [];
    const release = (url: string) => { if (preloadingInProgress.get(url) === owner) preloadingInProgress.delete(url); };
    const start = Math.max(0, currentIndex);
    const end = Math.min(currentIndex + preloadDepth, videoUrls.length);
    for (let i = start; i < end; i++) {
      const url = normalizeMediaUrl(videoUrls[i]);
      if (!url || !shouldPreloadMediaUrl(url) || preloadCache.has(url) || preloadingInProgress.has(url)) continue;
      if (preloadingInProgress.size >= MAX_CONCURRENT_PRELOADS) break;
      preloadingInProgress.set(url, owner);
      const preloadFn = () => {
        if (controller.signal.aborted || generation !== cacheGeneration) { release(url); return; }
        void preloadVideoMetadata(url, controller.signal).then(() => {
          if (!controller.signal.aborted && generation === cacheGeneration) {
            preloadCache.add(url);
            if (preloadCache.size > 256) preloadCache.delete(preloadCache.values().next().value!);
          }
        }).catch(() => {}).finally(() => release(url));
      };
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(preloadFn, { timeout: 3000 });
        scheduled.push(() => window.cancelIdleCallback?.(id));
      } else {
        const id = window.setTimeout(preloadFn, 50 * (i - currentIndex));
        scheduled.push(() => window.clearTimeout(id));
      }
    }
    return () => {
      controller.abort();
      scheduled.forEach(cancel => cancel());
      for (const [url, reservation] of preloadingInProgress) if (reservation === owner) preloadingInProgress.delete(url);
    };
  }, [videoUrls, currentIndex, preloadDepth, enabled]);

  return { preloadedCount: preloadCache.size };
}

/**
 * Preload video metadata only (fast, low bandwidth)
 */
export function preloadVideoMetadata(url: string, signal?: AbortSignal): Promise<void> {
  if (isIOSDevice()) return Promise.resolve();
  return preloadDetachedVideo(url, { preload: 'metadata', event: 'loadedmetadata', timeout: 3000, signal });
}

/** Full-video warming remains disabled on iOS to preserve its existing limit. */
export function preloadVideo(url: string, signal?: AbortSignal): Promise<void> {
  if (isIOSDevice()) return Promise.resolve();
  return preloadDetachedVideo(url, { preload: 'auto', event: 'canplaythrough', timeout: 5000, signal });
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
  
  cacheGeneration++;
  cancelDetachedVideoPreloads();
}
