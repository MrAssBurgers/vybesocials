import { memo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ClipVideoProgressProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  branded?: boolean;
  isMuted?: boolean;
}

const WAVE_BAR_COUNT = 8;

export const ClipVideoProgress = memo(function ClipVideoProgress({
  videoRef,
  isActive,
  branded = false,
  isMuted = true,
}: ClipVideoProgressProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const waveRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    const fill = fillRef.current;

    if (!video || !fill || !isActive) {
      if (fill) fill.style.transform = 'scaleX(0)';
      waveRefs.current.forEach((bar) => {
        if (bar) bar.style.transform = 'scaleY(0.15)';
      });
      return;
    }

    // Decorative bars must never reroute media audio: cross-origin sources
    // can become silent, and a processor per swiped clip retains resources.
    const paint = () => {
      const duration = video.duration;
      const progress =
        duration && Number.isFinite(duration) && duration > 0
          ? Math.min(Math.max(video.currentTime / duration, 0), 1)
          : 0;

      fill.style.transform = `scaleX(${progress})`;

      waveRefs.current.forEach((bar, i) => {
        if (!bar) return;
        const moving = !video.paused && !isMuted && document.visibilityState !== 'hidden';
        const height = moving ? 0.3 + (Math.sin(video.currentTime * 4 + i * 0.7) + 1) * 0.2 : 0.15;
        bar.style.transform = `scaleY(${height})`;
        bar.style.opacity = moving ? '0.6' : '0.25';
      });
    };
    const stop = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
    const tick = () => {
      rafRef.current = null;
      paint();
      if (!video.paused && document.visibilityState !== 'hidden') rafRef.current = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop(); paint();
      if (!video.paused && document.visibilityState !== 'hidden') rafRef.current = requestAnimationFrame(tick);
    };
    video.addEventListener('play', sync);
    video.addEventListener('pause', sync);
    video.addEventListener('loadedmetadata', sync);
    video.addEventListener('seeked', sync);
    document.addEventListener('visibilitychange', sync);
    sync();

    return () => {
      stop();
      video.removeEventListener('play', sync);
      video.removeEventListener('pause', sync);
      video.removeEventListener('loadedmetadata', sync);
      video.removeEventListener('seeked', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [videoRef, isActive, isMuted]);

  if (!isActive) return null;

  return (
    <div
      className="absolute inset-x-0 z-20 pointer-events-none"
      style={{ bottom: 'var(--clips-progress-bottom, 0px)' }}
    >
      <div className="flex items-end justify-center gap-[2px] px-2 pb-1 h-3">
        {Array.from({ length: WAVE_BAR_COUNT }).map((_, i) => (
          <span
            key={i}
            ref={(el) => {
              waveRefs.current[i] = el;
            }}
            className={cn(
              'w-[2px] h-2.5 rounded-full origin-bottom will-change-transform',
              branded
                ? 'bg-gradient-to-t from-primary/70 to-accent/90'
                : 'bg-white/70',
            )}
            style={{ transform: 'scaleY(0.15)', opacity: 0.25 }}
          />
        ))}
      </div>
      <div className={cn('h-[2px] w-full overflow-hidden', branded ? 'bg-white/10' : 'bg-white/15')}>
        <div
          ref={fillRef}
          className={cn(
            'h-full w-full origin-left will-change-transform',
            branded
              ? 'bg-gradient-to-r from-primary via-accent to-[hsl(var(--neon-pink))]'
              : 'bg-white/90',
          )}
          style={{ transform: 'scaleX(0)' }}
        />
      </div>
    </div>
  );
});
