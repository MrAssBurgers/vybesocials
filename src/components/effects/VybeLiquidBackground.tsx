import { memo, useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { haptics } from '@/lib/haptics';
import { registerVybeLiquidBgBoost } from '@/lib/vybeLiquidTouchBridge';
import { STABLE_APP_BACKGROUND } from '@/lib/appBackgroundMode';
import { isNativePerfMode } from '@/lib/nativePerfMode';

interface VybeLiquidBackgroundProps {
  className?: string;
  interactive?: boolean;
  /** App shell: blobs only: touch FX live in VybeLiquidTouchOverlay. */
  backgroundOnly?: boolean;
}

const BLOB_LAYOUT = [
  { id: 'a', anim: 'vybe-liquid-blob-a', dur: 96, top: '8%', left: '12%', size: 520 },
  { id: 'b', anim: 'vybe-liquid-blob-b', dur: 118, top: '62%', left: '78%', size: 640 },
  { id: 'c', anim: 'vybe-liquid-blob-c', dur: 132, top: '72%', left: '18%', size: 460 },
  { id: 'd', anim: 'vybe-liquid-blob-d', dur: 104, top: '22%', left: '82%', size: 580 },
] as const;

/** App shell — three theme blobs; slow, visible lava-lamp drift. */
const APP_SHELL_BLOB_LAYOUT = [
  { id: 'a', anim: 'vybe-liquid-blob-a', dur: 58, delay: 0, top: '12%', left: '18%', size: 560 },
  { id: 'b', anim: 'vybe-liquid-blob-b', dur: 72, delay: -12, top: '68%', left: '72%', size: 680 },
  { id: 'c', anim: 'vybe-liquid-blob-c', dur: 64, delay: -24, top: '38%', left: '52%', size: 420 },
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
  backgroundOnly = false,
}: VybeLiquidBackgroundProps) {
  const { resolvedTheme, reducedMotion } = useTheme();
  const isLight = resolvedTheme === 'light';
  const rootRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef<HTMLDivElement>(null);
  const surgeRef = useRef<HTMLDivElement>(null);
  const washRef = useRef<HTMLDivElement>(null);
  const boostTimerRef = useRef<number | null>(null);
  const lastTouchRef = useRef(0);
  const orientFrameRef = useRef<number | null>(null);

  const applyBgBoost = useCallback((clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root || root.classList.contains('vybe-liquid-bg--static')) return;

    const cx = window.innerWidth * 0.5;
    const cy = window.innerHeight * 0.5;
    const pullX = Math.max(-14, Math.min(14, ((clientX - cx) / cx) * -10));
    const pullY = Math.max(-10, Math.min(10, ((clientY - cy) / cy) * -8));

    root.style.setProperty('--pull-x', `${pullX}px`);
    root.style.setProperty('--pull-y', `${pullY}px`);
    root.classList.add('vybe-liquid-bg--boost');

    if (boostTimerRef.current) window.clearTimeout(boostTimerRef.current);
    boostTimerRef.current = window.setTimeout(() => {
      root.classList.remove('vybe-liquid-bg--boost');
      root.style.setProperty('--pull-x', '0px');
      root.style.setProperty('--pull-y', '0px');
    }, 1000);
  }, []);

  const triggerTouchResponse = useCallback(
    (clientX: number, clientY: number) => {
      const root = rootRef.current;
      if (!root || root.classList.contains('vybe-liquid-bg--static')) return;

      const now = Date.now();
      if (now - lastTouchRef.current < 80) return;
      lastTouchRef.current = now;

      const touchX = `${clientX}px`;
      const touchY = `${clientY}px`;

      root.style.setProperty('--touch-x', touchX);
      root.style.setProperty('--touch-y', touchY);

      retrigger(touchRef.current, 'vybe-liquid-touch--play');
      retrigger(surgeRef.current, 'vybe-liquid-surge--play');
      retrigger(washRef.current, 'vybe-liquid-wash--play');
      haptics.select();
      applyBgBoost(clientX, clientY);
    },
    [applyBgBoost],
  );

  const useStaticAurora =
    STABLE_APP_BACKGROUND ||
    isNativePerfMode() ||
    reducedMotion;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (useStaticAurora) {
      if (boostTimerRef.current) window.clearTimeout(boostTimerRef.current);
      boostTimerRef.current = null;
      root.classList.remove('vybe-liquid-bg--boost');
      for (const property of ['--pull-x', '--pull-y', '--tilt-x', '--tilt-y']) root.style.setProperty(property, '0px');
      touchRef.current?.classList.remove('vybe-liquid-touch--play');
      surgeRef.current?.classList.remove('vybe-liquid-surge--play');
      washRef.current?.classList.remove('vybe-liquid-wash--play');
    }
  }, [useStaticAurora]);

  useEffect(() => {
    if (useStaticAurora) return;
    if (!backgroundOnly || !interactive) return;
    return registerVybeLiquidBgBoost(applyBgBoost);
  }, [backgroundOnly, interactive, applyBgBoost, useStaticAurora]);

  useEffect(() => {
    return () => {
      if (boostTimerRef.current) window.clearTimeout(boostTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (useStaticAurora || typeof DeviceOrientationEvent === 'undefined') return;

    const root = rootRef.current;
    if (!root) return;

    let tiltX = 0;
    let tiltY = 0;
    const applyTilt = () => {
      orientFrameRef.current = null;
      root.style.setProperty('--tilt-x', `${tiltX}px`);
      root.style.setProperty('--tilt-y', `${tiltY}px`);
    };

    const onOrient = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0;
      const beta = e.beta ?? 0;
      tiltX = Math.max(-12, Math.min(12, gamma * 0.18));
      tiltY = Math.max(-8, Math.min(8, (beta - 45) * 0.1));
      if (orientFrameRef.current === null) orientFrameRef.current = requestAnimationFrame(applyTilt);
    };

    const req = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
      .requestPermission;

    // Decorative parallax must never request sensor permission on mount.
    if (typeof req === 'function') return;
    window.addEventListener('deviceorientation', onOrient, { passive: true });

    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      if (orientFrameRef.current !== null) cancelAnimationFrame(orientFrameRef.current);
      orientFrameRef.current = null;
    };
  }, [useStaticAurora]);

  useEffect(() => {
    if (useStaticAurora) return;
    if (!interactive || backgroundOnly) return;

    const onDown = (e: PointerEvent) => {
      triggerTouchResponse(e.clientX, e.clientY);
    };

    window.addEventListener('pointerdown', onDown, { capture: true, passive: true });
    return () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }, [interactive, backgroundOnly, triggerTouchResponse, useStaticAurora]);

  const blobLayout = backgroundOnly ? APP_SHELL_BLOB_LAYOUT : BLOB_LAYOUT;
  const showStaticColorLayers = isNativePerfMode() && backgroundOnly;
  const showAnimatedLayers = !STABLE_APP_BACKGROUND && !isNativePerfMode();
  const showColorBlobs = showAnimatedLayers || showStaticColorLayers;
  const showBloom = showColorBlobs;
  const showGrain = showAnimatedLayers && !backgroundOnly;

  const touchEffects = (
    <>
      <div ref={washRef} className="vybe-liquid-wash absolute inset-0" />
      <div ref={surgeRef} className="vybe-liquid-surge" />
      <div ref={touchRef} className="vybe-liquid-touch" aria-hidden>
        <span className="vybe-liquid-touch__compress" />
        <span className="vybe-liquid-touch__nova" />
        <span className="vybe-liquid-touch__shockwave" />
        <span className="vybe-liquid-touch__shockwave vybe-liquid-touch__shockwave--alt" />
      </div>
    </>
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        'vybe-liquid-bg fixed inset-0 overflow-hidden pointer-events-none select-none',
        isLight ? 'vybe-liquid-bg--bright' : 'vybe-liquid-bg--dark',
        useStaticAurora && 'vybe-liquid-bg--static',
        className,
      )}
      data-allow-animation="true"
      aria-hidden
    >
      <div className="vybe-liquid-parallax absolute inset-[-24%]">
        <div className="vybe-liquid-mesh absolute inset-0" />
        {showColorBlobs && (
          <>
            {showBloom && <div className="vybe-liquid-bloom absolute inset-[-18%]" />}
            {blobLayout.map((blob) => (
              <div
                key={blob.id}
                className={cn('vybe-liquid-blob absolute', `vybe-liquid-blob--${blob.id}`)}
                style={{
                  top: blob.top,
                  left: blob.left,
                  width: blob.size,
                  height: blob.size,
                  ['--blob-dur' as string]: `${blob.dur}s`,
                  ...('delay' in blob && blob.delay !== undefined
                    ? { animationDelay: `${blob.delay}s` }
                    : {}),
                }}
              />
            ))}
          </>
        )}
      </div>

      {showGrain && <div className="vybe-liquid-grain absolute inset-0" />}

      {!backgroundOnly && !useStaticAurora && touchEffects}
    </div>
  );
});
