import { memo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { haptics } from '@/lib/haptics';

interface VybeLiquidBackgroundProps {
  className?: string;
  interactive?: boolean;
}

const BLOB_LAYOUT = [
  { id: 'a', anim: 'vybe-liquid-blob-a', dur: 25, top: '8%', left: '12%', size: 520 },
  { id: 'b', anim: 'vybe-liquid-blob-b', dur: 37, top: '62%', left: '78%', size: 640 },
  { id: 'c', anim: 'vybe-liquid-blob-c', dur: 42, top: '72%', left: '18%', size: 460 },
  { id: 'd', anim: 'vybe-liquid-blob-d', dur: 31, top: '22%', left: '82%', size: 580 },
] as const;

function retrigger(el: HTMLElement | null, activeClass: string) {
  if (!el) return;
  el.classList.remove(activeClass);
  void el.offsetWidth;
  el.classList.add(activeClass);
}

export const VybeLiquidBackground = memo(function VybeLiquidBackground({
  className,
  interactive = true,
}: VybeLiquidBackgroundProps) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';
  const rootRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<HTMLDivElement>(null);
  const surgeRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const boostTimerRef = useRef<number | null>(null);
  const lastTouchRef = useRef(0);
  const orientPendingRef = useRef(false);

  const triggerTouchResponse = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root || root.classList.contains('vybe-liquid-bg--static')) return;

    const now = Date.now();
    if (now - lastTouchRef.current < 80) return;
    lastTouchRef.current = now;

    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    const pullX = Math.max(-14, Math.min(14, ((clientX - cx) / cx) * -10));
    const pullY = Math.max(-10, Math.min(10, ((clientY - cy) / cy) * -8));

    root.style.setProperty('--touch-x', `${clientX}px`);
    root.style.setProperty('--touch-y', `${clientY}px`);
    root.style.setProperty('--pull-x', `${pullX}px`);
    root.style.setProperty('--pull-y', `${pullY}px`);

    retrigger(touchRef.current, 'vybe-liquid-touch--play');
    retrigger(surgeRef.current, 'vybe-liquid-surge--play');
    retrigger(washRef.current, 'vybe-liquid-wash--play');
    haptics.select();

    root.classList.add('vybe-liquid-bg--boost');
    if (boostTimerRef.current) window.clearTimeout(boostTimerRef.current);
    boostTimerRef.current = window.setTimeout(() => {
      root.classList.remove('vybe-liquid-bg--boost');
      root.style.setProperty('--pull-x', '0px');
      root.style.setProperty('--pull-y', '0px');
    }, 1000);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('vybe-liquid-bg--static');
    }
  }, []);

  useEffect(() => {
    return () => {
      if (boostTimerRef.current) window.clearTimeout(boostTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const root = rootRef.current;
    if (!root) return;

    const applyTilt = () => {
      orientPendingRef.current = false;
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      root.style.setProperty('--tilt-x', `${Math.max(-12, Math.min(12, gamma * 0.18))}px`);
      root.style.setProperty('--tilt-y', `${Math.max(-8, Math.min(8, (beta - 45) * 0.1))}px`);
      if (!orientPendingRef.current) {
        orientPendingRef.current = true;
        requestAnimationFrame(applyTilt);
      }
    };

    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission;

    if (typeof req === 'function') {
      req()
        .then((state) => {
          if (state === 'granted') {
            window.addEventListener('deviceorientation', onOrient, { passive: true });
          }
        })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
    }

    return () => window.removeEventListener('deviceorientation', onOrient);
  }, []);

  useEffect(() => {
    if (!interactive) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;

    const onDown = (e: PointerEvent) => {
      triggerTouchResponse(e.clientX, e.clientY);
    };

    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, [interactive, triggerTouchResponse]);

  return (
    <div
      ref={rootRef}
      className={cn(
        'vybe-liquid-bg fixed inset-0 overflow-hidden pointer-events-none select-none',
        isLight ? 'vybe-liquid-bg--bright' : 'vybe-liquid-bg--dark',
        className,
      )}
      aria-hidden
    >
      <div className="vybe-liquid-parallax absolute inset-[-8%]">
        <div className="vybe-liquid-mesh absolute inset-0" />
        <div className="vybe-liquid-bloom absolute inset-[-15%]" />

        {BLOB_LAYOUT.map((blob) => (
          <div
            key={blob.id}
            className={cn('vybe-liquid-blob absolute', `vybe-liquid-blob--${blob.id}`)}
            style={{
              top: blob.top,
              left: blob.left,
              width: blob.size,
              height: blob.size,
              ['--blob-dur' as string]: `${blob.dur}s`,
            }}
          />
        ))}
      </div>

      <div ref={washRef} className="vybe-liquid-wash absolute inset-0" />
      <div ref={surgeRef} className="vybe-liquid-surge" />

      <div className="vybe-liquid-grain absolute inset-0" />

      <div ref={touchRef} className="vybe-liquid-touch" aria-hidden>
        <span className="vybe-liquid-touch__compress" />
        <span className="vybe-liquid-touch__nova" />
        <span className="vybe-liquid-touch__shockwave" />
        <span className="vybe-liquid-touch__shockwave vybe-liquid-touch__shockwave--alt" />
      </div>
    </div>
  );
});
