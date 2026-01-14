import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to debounce expensive operations
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  
  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: Parameters<T>) => {
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
 * Hook to throttle expensive operations
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const lastCallRef = useRef(0);
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    ((...args: Parameters<T>) => {
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
 * Hook to lazy load data only when component is visible
 */
export function useLazyLoad(callback: () => void, options?: IntersectionObserverInit) {
  const ref = useRef<HTMLElement | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (!ref.current || hasLoadedRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasLoadedRef.current) {
          hasLoadedRef.current = true;
          callback();
          observer.disconnect();
        }
      },
      { rootMargin: '100px', threshold: 0, ...options }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [callback, options]);

  return ref;
}

/**
 * Hook to preload images
 */
export function useImagePreload(urls: (string | null | undefined)[]) {
  useEffect(() => {
    const validUrls = urls.filter((url): url is string => !!url);
    
    validUrls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, [urls]);
}

/**
 * Hook to detect slow network and reduce quality
 */
export function useNetworkQuality() {
  const connection = (navigator as any).connection;
  
  if (!connection) {
    return { isSlowNetwork: false, effectiveType: '4g' };
  }
  
  const effectiveType = connection.effectiveType || '4g';
  const isSlowNetwork = effectiveType === '2g' || effectiveType === 'slow-2g';
  
  return { isSlowNetwork, effectiveType };
}

/**
 * Hook for request idle callback with fallback
 */
export function useIdleCallback(callback: () => void, options?: { timeout?: number }) {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = requestIdleCallback(callback, options);
      return () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(callback, options?.timeout || 1);
      return () => clearTimeout(id);
    }
  }, [callback, options]);
}
