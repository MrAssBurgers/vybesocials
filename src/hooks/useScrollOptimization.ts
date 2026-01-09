import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to detect scrolling and add/remove 'is-scrolling' class to document
 * This allows CSS to pause animations during scroll for better performance
 */
export function useScrollOptimization() {
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isScrollingRef = useRef(false);

  const handleScroll = useCallback(() => {
    if (!isScrollingRef.current) {
      isScrollingRef.current = true;
      document.documentElement.classList.add('is-scrolling');
    }

    // Clear existing timeout
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    // Set new timeout to remove class after scroll ends
    scrollTimeoutRef.current = setTimeout(() => {
      isScrollingRef.current = false;
      document.documentElement.classList.remove('is-scrolling');
    }, 150);
  }, []);

  useEffect(() => {
    // Use passive listener for better scroll performance
    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      document.documentElement.classList.remove('is-scrolling');
    };
  }, [handleScroll]);
}

/**
 * Hook to add will-change hints for better GPU acceleration
 * Call this on elements that will animate frequently
 */
export function useGPUAcceleration(ref: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.style.transform = 'translateZ(0)';
    element.style.willChange = 'transform, opacity';
    element.style.backfaceVisibility = 'hidden';

    return () => {
      element.style.transform = '';
      element.style.willChange = '';
      element.style.backfaceVisibility = '';
    };
  }, [ref]);
}
