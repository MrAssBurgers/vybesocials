import { useEffect, useRef } from 'react';

// Shared state to prevent multiple listeners - using WeakRef pattern
let scrollListenerAttached = false;
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
let isScrolling = false;

/**
 * Hook to detect scrolling and add/remove 'is-scrolling' class to document
 * Uses passive listeners and reduced updates for better performance
 * SINGLETON: Only one listener across all components
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
      }, 200); // Slightly longer timeout for less flickering
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
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
 * Hook to add will-change hints for better GPU acceleration
 * Uses transform3d for hardware acceleration
 */
export function useGPUAcceleration(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Use contain for better performance isolation
    element.style.contain = 'layout style paint';
    element.style.transform = 'translateZ(0)';
    element.style.backfaceVisibility = 'hidden';

    return () => {
      element.style.contain = '';
      element.style.transform = '';
      element.style.backfaceVisibility = '';
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
 * Frame-rate aware animation hook - optimized to avoid memory leaks
 */
export function useFrameCallback(callback: () => void, enabled = true) {
  const frameRef = useRef<number>();
  const callbackRef = useRef(callback);
  
  // Update callback ref without triggering effect
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
