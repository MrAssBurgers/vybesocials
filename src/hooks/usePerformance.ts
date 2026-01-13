import { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Ultra-fast performance utilities for the entire app
 */

// ============ INTERSECTION OBSERVER POOL ============
// Share a single IntersectionObserver across the app
const observerCallbacks = new Map<Element, (entry: IntersectionObserverEntry) => void>();
let sharedObserver: IntersectionObserver | null = null;

function getSharedObserver(rootMargin = '200px') {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const callback = observerCallbacks.get(entry.target);
          callback?.(entry);
        });
      },
      { rootMargin, threshold: 0 }
    );
  }
  return sharedObserver;
}

export function useSharedIntersection(
  ref: React.RefObject<HTMLElement>,
  callback: (isIntersecting: boolean) => void,
  options?: { once?: boolean }
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const hasTriggered = useRef(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = getSharedObserver();
    
    const handler = (entry: IntersectionObserverEntry) => {
      if (options?.once && hasTriggered.current) return;
      if (entry.isIntersecting && options?.once) {
        hasTriggered.current = true;
        observer.unobserve(element);
        observerCallbacks.delete(element);
      }
      callbackRef.current(entry.isIntersecting);
    };

    observerCallbacks.set(element, handler);
    observer.observe(element);

    return () => {
      observer.unobserve(element);
      observerCallbacks.delete(element);
    };
  }, [ref, options?.once]);
}

// ============ LAZY COMPONENT RENDERING ============
export function useLazyRender(ref: React.RefObject<HTMLElement>) {
  const [shouldRender, setShouldRender] = useState(false);

  useSharedIntersection(
    ref,
    (isIntersecting) => {
      if (isIntersecting) setShouldRender(true);
    },
    { once: true }
  );

  return shouldRender;
}

// ============ RENDER DEBOUNCING ============
export function useRenderDebounce<T>(value: T, delay = 100): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// ============ BATCH QUERY INVALIDATION ============
const pendingInvalidations = new Set<string>();
let invalidationTimer: ReturnType<typeof setTimeout> | null = null;

export function useBatchInvalidation() {
  const queryClient = useQueryClient();

  return useCallback((queryKey: string) => {
    pendingInvalidations.add(queryKey);

    if (!invalidationTimer) {
      invalidationTimer = setTimeout(() => {
        pendingInvalidations.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: [key] });
        });
        pendingInvalidations.clear();
        invalidationTimer = null;
      }, 50);
    }
  }, [queryClient]);
}

// ============ STABLE CALLBACK ============
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args) => callbackRef.current(...args)) as T,
    []
  );
}

// ============ MEMORY-EFFICIENT LIST ============
export function useWindowedList<T>(
  items: T[],
  visibleCount: number,
  overscan = 5
) {
  const [scrollIndex, setScrollIndex] = useState(0);

  const visibleItems = useMemo(() => {
    const start = Math.max(0, scrollIndex - overscan);
    const end = Math.min(items.length, scrollIndex + visibleCount + overscan);
    return items.slice(start, end).map((item, i) => ({
      item,
      index: start + i,
    }));
  }, [items, scrollIndex, visibleCount, overscan]);

  const updateScrollIndex = useCallback((index: number) => {
    setScrollIndex(Math.max(0, Math.min(items.length - 1, index)));
  }, [items.length]);

  return { visibleItems, updateScrollIndex, totalCount: items.length };
}

// ============ REQUEST IDLE CALLBACK POLYFILL ============
const requestIdleCallback =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? window.requestIdleCallback
    : (cb: () => void) => setTimeout(cb, 1);

// ============ DEFERRED WORK QUEUE ============
const deferredQueue: (() => void)[] = [];
let isProcessingDeferred = false;

export function deferWork(task: () => void) {
  deferredQueue.push(task);

  if (!isProcessingDeferred) {
    isProcessingDeferred = true;
    requestIdleCallback(() => {
      while (deferredQueue.length > 0) {
        const work = deferredQueue.shift();
        work?.();
      }
      isProcessingDeferred = false;
    });
  }
}

// ============ PREFETCH ON HOVER ============
export function usePrefetchOnHover(
  queryKey: unknown[],
  queryFn: () => Promise<any>,
  staleTime = 1000 * 60 * 5
) {
  const queryClient = useQueryClient();
  const isPrefetched = useRef(false);

  const onMouseEnter = useCallback(() => {
    if (isPrefetched.current) return;
    isPrefetched.current = true;

    queryClient.prefetchQuery({
      queryKey,
      queryFn,
      staleTime,
    });
  }, [queryClient, queryKey, queryFn, staleTime]);

  return { onMouseEnter };
}

// ============ FRAME-RATE LIMITER ============
export function useFrameThrottle<T extends (...args: any[]) => void>(
  callback: T
): T {
  const frameRef = useRef<number>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args) => {
      if (frameRef.current) return;
      frameRef.current = requestAnimationFrame(() => {
        callbackRef.current(...args);
        frameRef.current = undefined;
      });
    }) as T,
    []
  );
}

// ============ COMPONENT MOUNT TRACKER ============
export function useIsMounted() {
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  return isMounted;
}

// ============ CLEANUP ON UNMOUNT ============
export function useCleanup(cleanupFn: () => void) {
  const cleanupRef = useRef(cleanupFn);
  cleanupRef.current = cleanupFn;

  useEffect(() => {
    return () => cleanupRef.current();
  }, []);
}

// ============ PRELOAD CRITICAL RESOURCES ============
export function preloadCriticalResources() {
  // Preload common routes
  const routes = ['/home', '/messages', '/notifications'];
  
  routes.forEach((route) => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = route;
    document.head.appendChild(link);
  });
}

// ============ REDUCE MOTION CHECK ============
let cachedPrefersReducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (cachedPrefersReducedMotion === null) {
    cachedPrefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return cachedPrefersReducedMotion;
}

// ============ QUICK TRANSITIONS ============
export const FAST_TRANSITIONS = {
  instant: { duration: 0.1 },
  fast: { duration: 0.15 },
  normal: { duration: 0.2 },
  spring: { type: 'spring', stiffness: 500, damping: 30 },
};
