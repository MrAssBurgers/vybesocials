import { useState, useEffect, useRef } from 'react';

export type ScrollDirection = 'up' | 'down' | null;

interface UseScrollDirectionOptions {
  threshold?: number; // Minimum scroll delta to trigger direction change
  initialDirection?: ScrollDirection;
}

/**
 * Detects scroll direction for showing/hiding UI elements
 * Returns 'up' when scrolling up, 'down' when scrolling down
 */
export function useScrollDirection(options: UseScrollDirectionOptions = {}) {
  const { threshold = 10, initialDirection = null } = options;
  
  const [scrollDirection, setScrollDirection] = useState<ScrollDirection>(initialDirection);
  const [isAtTop, setIsAtTop] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    // Find the scrollable container - could be the main content area or window
    const getScrollContainer = (): HTMLElement | Window => {
      const mainContent = document.querySelector('[data-app-scroll-container="true"]');
      return mainContent as HTMLElement || window;
    };

    const updateScrollDirection = () => {
      const container = getScrollContainer();
      const currentScrollY = container === window 
        ? window.scrollY 
        : (container as HTMLElement).scrollTop;

      const delta = currentScrollY - lastScrollY.current;

      // Update isAtTop
      setIsAtTop(currentScrollY < 50);

      // Only update direction if we've scrolled past threshold
      if (Math.abs(delta) >= threshold) {
        const newDirection: ScrollDirection = delta > 0 ? 'down' : 'up';
        setScrollDirection(newDirection);
        lastScrollY.current = currentScrollY;
      }

      ticking.current = false;
    };

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(updateScrollDirection);
        ticking.current = true;
      }
    };

    // Listen on both the container and window for scroll events
    const container = getScrollContainer();
    
    if (container === window) {
      window.addEventListener('scroll', onScroll, { passive: true });
    } else {
      (container as HTMLElement).addEventListener('scroll', onScroll, { passive: true });
      // Also listen to window in case of nested scrolls
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    // Initial check
    updateScrollDirection();

    return () => {
      if (container === window) {
        window.removeEventListener('scroll', onScroll);
      } else {
        (container as HTMLElement).removeEventListener('scroll', onScroll);
        window.removeEventListener('scroll', onScroll);
      }
    };
  }, [threshold]);

  return { 
    scrollDirection, 
    isAtTop,
    isScrollingUp: scrollDirection === 'up',
    isScrollingDown: scrollDirection === 'down',
  };
}
