import { memo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { haptics } from '@/lib/haptics';
import { useVybeLiquidTouchDocumentShell } from '@/hooks/useVybeLiquidTouchDocumentShell';
import { setVybeLiquidTouchSystemActive } from '@/lib/liquidShellState';
import {
  registerVybeLiquidTouchVisuals,
  triggerVybeLiquidTouch,
} from '@/lib/vybeLiquidTouchBridge';

function retrigger(el: HTMLElement | null, activeClass: string) {
  if (!el) return;
  el.classList.remove(activeClass);
  void el.offsetWidth;
  el.classList.add(activeClass);
}

interface VybeLiquidTouchOverlayProps {
  /** Within parent stacking context. App shell uses 5010; Landing uses 25 above z-10 card. */
  zIndex?: number;
}

/** Tap ripples — pointer-events none; disabled entirely when custom wallpaper is active. */
export const VybeLiquidTouchOverlay = memo(function VybeLiquidTouchOverlay({
  zIndex = 5010,
}: VybeLiquidTouchOverlayProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<HTMLDivElement>(null);
  const surgeRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);

  useVybeLiquidTouchDocumentShell(true);

  useEffect(() => {
    setVybeLiquidTouchSystemActive(true);
    return () => setVybeLiquidTouchSystemActive(false);
  }, []);

  const playTouchVisuals = useCallback((clientX: number, clientY: number) => {
    const touchX = `${clientX}px`;
    const touchY = `${clientY}px`;
    hostRef.current?.style.setProperty('--touch-x', touchX);
    hostRef.current?.style.setProperty('--touch-y', touchY);

    retrigger(touchRef.current, 'vybe-liquid-touch--play');
    retrigger(surgeRef.current, 'vybe-liquid-surge--play');
    retrigger(washRef.current, 'vybe-liquid-wash--play');
    haptics.select();
  }, []);

  useEffect(() => registerVybeLiquidTouchVisuals(playTouchVisuals), [playTouchVisuals]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      triggerVybeLiquidTouch(e.clientX, e.clientY);
    };
    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, []);

  return (
    <div
      ref={hostRef}
      className={cn(
        'vybe-liquid-bg vybe-liquid-touch-layer fixed inset-0',
        'overflow-hidden pointer-events-none select-none',
      )}
      style={{ zIndex }}
      data-allow-animation="true"
      aria-hidden
    >
      <div ref={washRef} className="vybe-liquid-wash absolute inset-0" />
      <div ref={surgeRef} className="vybe-liquid-surge" />
      <div ref={touchRef} className="vybe-liquid-touch" aria-hidden>
        <span className="vybe-liquid-touch__compress" />
        <span className="vybe-liquid-touch__nova" />
        <span className="vybe-liquid-touch__shockwave" />
        <span className="vybe-liquid-touch__shockwave vybe-liquid-touch__shockwave--alt" />
      </div>
    </div>
  );
});
