import { useEffect, useRef } from 'react';

/**
 * Converts vertical mouse-wheel motion into horizontal scrolling
 * on an overflow-x container. Only intercepts when the container
 * can actually scroll further in the wheel direction.
 */
export function useHorizontalScroll<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // Only hijack when vertical wheel is dominant
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      // Only when there's overflow
      if (el.scrollWidth <= el.clientWidth) return;

      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;

      // Don't trap if already at the edge the user is scrolling toward
      if (e.deltaY < 0 && atLeft) return;
      if (e.deltaY > 0 && atRight) return;

      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return ref;
}
