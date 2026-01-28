import { useEffect, useRef } from 'react';

// Shared state - singleton pattern
let scrollListenerAttached = false;
let isScrolling = false;

/**
 * Lightweight scroll optimization hook - uses passive listeners
 * SINGLETON: Only one listener across all components
 * NOTE: This hook only adds a CSS class during scroll - it does NOT block scrolling
 */
export function useScrollOptimization() {
  useEffect(() => {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;

    let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        document.documentElement.classList.add('is-scrolling');
      }

      if (scrollTimeout) clearTimeout(scrollTimeout);
      
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        document.documentElement.classList.remove('is-scrolling');
      }, 100); // Short timeout for snappy response
    };

    // CRITICAL: passive: true ensures this listener never blocks scrolling
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      scrollListenerAttached = false;
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
      }
      isScrolling = false;
      document.documentElement.classList.remove('is-scrolling');
    };
  }, []);
}

/**
 * Lightweight GPU acceleration - only applies essential styles
 */
export function useGPUAcceleration(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Minimal GPU hints - avoid will-change which can cause issues
    element.style.transform = 'translateZ(0)';

    return () => {
      element.style.transform = '';
    };
  }, [ref]);
}

/**
 * Reduced motion detection - cached result
 */
let cachedReducedMotion: boolean | null = null;
export function usePrefersReducedMotion() {
  if (cachedReducedMotion === null && typeof window !== 'undefined') {
    cachedReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return cachedReducedMotion ?? false;
}

/**
 * Simplified frame callback - only runs when enabled
 */
export function useFrameCallback(callback: () => void, enabled = true) {
  const frameRef = useRef<number>();
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;

    let isActive = true;

    const tick = () => {
      if (!isActive) return;
      callbackRef.current();
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      isActive = false;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled]);
}
