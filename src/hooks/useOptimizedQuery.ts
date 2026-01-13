import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { useMemo, useRef, useCallback, useState, useEffect } from 'react';

/**
 * Optimized query hook with built-in deduplication and caching
 */
export function useOptimizedQuery<T>(
  queryKey: unknown[],
  queryFn: () => Promise<T>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>
) {
  // Memoize query key to prevent unnecessary re-renders
  const stableKey = useMemo(() => queryKey, [JSON.stringify(queryKey)]);
  
  return useQuery({
    queryKey: stableKey,
    queryFn,
    staleTime: 1000 * 60 * 5, // 5 min default
    gcTime: 1000 * 60 * 30, // 30 min cache
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    ...options,
  });
}

/**
 * Debounce hook for search/filter inputs
 */
export function useDebouncedCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    }) as T,
    [delay]
  );
}

/**
 * Throttle hook for scroll/resize handlers
 */
export function useThrottledCallback<T extends (...args: unknown[]) => unknown>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  return useCallback(
    ((...args) => {
      const now = Date.now();
      if (now - lastCallRef.current >= delay) {
        lastCallRef.current = now;
        callbackRef.current(...args);
      }
    }) as T,
    [delay]
  );
}

/**
 * Intersection observer hook for lazy loading
 */
export function useLazyLoad(
  ref: React.RefObject<HTMLElement>,
  options?: IntersectionObserverInit
) {
  const [isInView, setIsInView] = useState(false);
  const observerRef = useRef<IntersectionObserver>();

  useEffect(() => {
    if (!ref.current) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: '100px', ...options }
    );

    observerRef.current.observe(ref.current);

    return () => observerRef.current?.disconnect();
  }, [ref, options]);

  return isInView;
}

/**
 * Memory-efficient list virtualization helper
 */
export function useVirtualList<T>(
  items: T[],
  containerHeight: number,
  itemHeight: number,
  overscan = 3
) {
  const [scrollTop, setScrollTop] = useState(0);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
  );

  const visibleItems = useMemo(
    () => items.slice(startIndex, endIndex).map((item, i) => ({
      item,
      index: startIndex + i,
      style: {
        position: 'absolute' as const,
        top: (startIndex + i) * itemHeight,
        height: itemHeight,
        width: '100%',
      },
    })),
    [items, startIndex, endIndex, itemHeight]
  );

  const totalHeight = items.length * itemHeight;

  return {
    visibleItems,
    totalHeight,
    onScroll: (e: React.UIEvent<HTMLElement>) => setScrollTop(e.currentTarget.scrollTop),
  };
}
