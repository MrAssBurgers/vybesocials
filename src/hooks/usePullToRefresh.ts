import { useState, useRef, useCallback, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

export function usePullToRefresh({ 
  onRefresh, 
  threshold = 80, 
  maxPull = 120 
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const rafId = useRef<number | null>(null);

  // In this app, mobile scrolling happens inside AppLayout's <main> (not window scroll).
  // We mark it with data-app-scroll-container="true".
  const getScrollElement = useCallback((): HTMLElement | null => {
    if (typeof document === 'undefined') return null;
    return document.querySelector<HTMLElement>('[data-app-scroll-container="true"]');
  }, []);

  const getScrollTop = useCallback((): number => {
    const el = getScrollElement();
    if (el) return el.scrollTop;
    // Fallback for pages that use normal document scrolling
    return (document.scrollingElement?.scrollTop ?? window.scrollY ?? 0);
  }, [getScrollElement]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (isRefreshing) return;

    const scrollTop = getScrollTop();
    if (scrollTop <= 0.5) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  }, [getScrollTop, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;

    const scrollTop = getScrollTop();
    if (scrollTop > 0.5) {
      isPulling.current = false;
      if (pullDistance > 0) setPullDistance(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;

    // If the user is swiping UP (normal scroll down the feed), don't treat it as pull-to-refresh.
    if (diff <= 0) {
      isPulling.current = false;
      if (pullDistance > 0) setPullDistance(0);
      return;
    }

    // Use RAF for smooth updates - but batch them
    if (rafId.current) return; // Skip if a frame is already pending

    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      const resistance = 0.4;
      const distance = Math.min(diff * resistance, maxPull);
      setPullDistance(distance);
    });

    // Only prevent default once we're clearly pulling down
    if (diff > 30) {
      e.preventDefault();
    }
  }, [getScrollTop, isRefreshing, maxPull, pullDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const scrollEl = getScrollElement();
    const target: HTMLElement | Document = scrollEl ?? document;

    target.addEventListener('touchstart', handleTouchStart, { passive: true });
    target.addEventListener('touchmove', handleTouchMove, { passive: false });
    target.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      target.removeEventListener('touchstart', handleTouchStart);
      target.removeEventListener('touchmove', handleTouchMove);
      target.removeEventListener('touchend', handleTouchEnd);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [getScrollElement, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    pullDistance,
    isRefreshing,
    threshold,
  };
}
