import { useEffect, useRef, useCallback } from 'react';

/**
 * Subtle mouse-based parallax effect for depth layers.
 * Max shift is 8px for a premium, non-distracting feel.
 */
export function useLiquidParallax(maxShift = 8) {
  const bgRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<HTMLDivElement>(null);
  const rafId = useRef<number>(0);

  const handleMove = useCallback((e: MouseEvent) => {
    if (rafId.current) return;
    
    rafId.current = requestAnimationFrame(() => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx; // -1 to 1
      const dy = (e.clientY - cy) / cy; // -1 to 1

      if (bgRef.current) {
        bgRef.current.style.transform = `translate(${dx * -maxShift * 0.5}px, ${dy * -maxShift * 0.5}px)`;
      }
      if (fgRef.current) {
        fgRef.current.style.transform = `translate(${dx * maxShift}px, ${dy * maxShift}px)`;
      }
      rafId.current = 0;
    });
  }, [maxShift]);

  useEffect(() => {
    // Only enable on non-touch, non-reduced-motion devices
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouch = 'ontouchstart' in window;
    if (prefersReduced || isTouch) return;

    window.addEventListener('mousemove', handleMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleMove]);

  return { bgRef, fgRef };
}
