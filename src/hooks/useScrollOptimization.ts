import { useEffect, useRef, useCallback } from 'react';

// Shared state to prevent multiple listeners
let scrollListenerAttached = false;
let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
let rafId: number | null = null;

/**
 * Hook to detect scrolling and add/remove 'is-scrolling' class to document
 * Uses requestAnimationFrame for smoother performance
 */
export function useScrollOptimization() {
  useEffect(() => {
    if (scrollListenerAttached) return;
    scrollListenerAttached = true;

    let isScrolling = false;
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        rafId = requestAnimationFrame(() => {
          if (!isScrolling) {
            isScrolling = true;
            document.documentElement.classList.add('is-scrolling');
          }

          if (scrollTimeout) clearTimeout(scrollTimeout);
          
          scrollTimeout = setTimeout(() => {
            isScrolling = false;
            document.documentElement.classList.remove('is-scrolling');
          }, 100);

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      scrollListenerAttached = false;
      if (scrollTimeout) clearTimeout(scrollTimeout);
      if (rafId) cancelAnimationFrame(rafId);
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
    element.style.transform = 'translate3d(0, 0, 0)';

    return () => {
      element.style.contain = '';
      element.style.transform = '';
    };
  }, [ref]);
}

/**
 * Reduced motion detection
 */
export function usePrefersReducedMotion() {
  const mediaQuery = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  
  return mediaQuery?.matches ?? false;
}

/**
 * Frame-rate aware animation hook
 */
export function useFrameCallback(callback: () => void, enabled = true) {
  const frameRef = useRef<number>();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      callbackRef.current();
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [enabled]);
}
