import { useEffect, useRef } from 'react';

// Shared state - singleton pattern
let scrollListenerAttached = false;
let isScrolling = false;
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Lightweight scroll optimization hook - uses passive listeners
 * SINGLETON: Only one listener across all components
 * NOTE: This hook only adds a CSS class during scroll - it does NOT block scrolling
 * IMPORTANT: We use a short timeout and aggressive cleanup to prevent the class from
 * getting stuck (which would block pointer-events on desktop).
 */
export function useScrollOptimization() {
  useEffect(() => {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;

    const handleScroll = () => {
      if (!isScrolling) {
        isScrolling = true;
        document.documentElement.classList.add('is-scrolling');
      }

      if (scrollTimeout) clearTimeout(scrollTimeout);
      
      scrollTimeout = setTimeout(() => {
        isScrolling = false;
        document.documentElement.classList.remove('is-scrolling');
      }, 80); // Slightly shorter for quicker response
    };

    // Also clean up on any click to ensure we never get stuck
    const handleInteraction = () => {
      if (isScrolling) {
        if (scrollTimeout) clearTimeout(scrollTimeout);
        isScrolling = false;
        document.documentElement.classList.remove('is-scrolling');
      }
    };

    // CRITICAL: passive: true ensures this listener never blocks scrolling
    window.addEventListener('scroll', handleScroll, { passive: true });
    // Clean up on any click/touch to prevent stuck state
    window.addEventListener('click', handleInteraction, { passive: true, capture: true });
    window.addEventListener('touchstart', handleInteraction, { passive: true, capture: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
      scrollListenerAttached = false;
      if (scrollTimeout) {
        clearTimeout(scrollTimeout);
        scrollTimeout = null;
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
