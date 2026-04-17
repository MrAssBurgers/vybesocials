import { useEffect, useRef } from 'react';

/**
 * Apple-style elastic overscroll for the top of a scrollable container.
 * When the user pulls down past 0, the content rubber-bands with diminishing
 * resistance and snaps back via spring on release.
 *
 * Usage:
 *   const ref = useElasticScroll<HTMLDivElement>();
 *   <div ref={ref} className="overflow-y-auto">…</div>
 */
export function useElasticScroll<T extends HTMLElement = HTMLDivElement>(options?: {
  /** Resistance factor — higher = stiffer. Default 0.45 (Apple-ish). */
  resistance?: number;
  /** Maximum pull distance in px. Default 120. */
  maxPull?: number;
  /** Disable the effect (e.g., for reduced-motion users). */
  disabled?: boolean;
}) {
  const ref = useRef<T | null>(null);
  const resistance = options?.resistance ?? 0.45;
  const maxPull = options?.maxPull ?? 120;
  const disabled = options?.disabled ?? false;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;

    let startY = 0;
    let pulling = false;
    let translate = 0;
    let raf = 0;

    const apply = (y: number) => {
      el.style.transform = y === 0 ? '' : `translate3d(0, ${y}px, 0)`;
      el.style.willChange = y === 0 ? '' : 'transform';
    };

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) {
        pulling = false;
        return;
      }
      startY = e.touches[0].clientY;
      pulling = true;
      el.style.transition = '';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling) return;
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        if (translate !== 0) {
          translate = 0;
          apply(0);
        }
        return;
      }
      // Diminishing resistance curve (asymptote at maxPull)
      translate = Math.min(maxPull, delta * resistance * (1 - delta / (delta + 600)));
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(translate));
    };

    const release = () => {
      if (!pulling) return;
      pulling = false;
      if (translate === 0) return;
      // Spring back via CSS transition (cheap & smooth on mobile)
      el.style.transition = 'transform 420ms cubic-bezier(0.22, 1.4, 0.36, 1)';
      translate = 0;
      apply(0);
      window.setTimeout(() => {
        if (el) el.style.transition = '';
      }, 440);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', release, { passive: true });
    el.addEventListener('touchcancel', release, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', release);
      el.removeEventListener('touchcancel', release);
      cancelAnimationFrame(raf);
      apply(0);
      el.style.transition = '';
    };
  }, [resistance, maxPull, disabled]);

  return ref;
}
