import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Beats per minute from Spotify audio features */
  tempo?: number | null;
  /** 0..1 energy from Spotify audio features */
  energy?: number | null;
  isPlaying?: boolean;
  bars?: number;
  /** Total height in px */
  height?: number;
  className?: string;
  color?: string;
}

/**
 * BPM/energy-driven equalizer bars. Uses a single rAF loop and CSS transforms
 * so it stays at 60fps even on a busy DM list. Falls back to a gentle sine
 * sweep when tempo isn't known yet.
 */
export function LiveSpotifyWaveform({
  tempo,
  energy,
  isPlaying = true,
  bars = 4,
  height = 12,
  className,
  color = '#1DB954',
}: Props) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const barRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      // Park bars at a low resting height
      barRefs.current.forEach((el) => {
        if (el) el.style.transform = 'scaleY(0.25)';
      });
      return;
    }

    const bpm = tempo && tempo > 30 ? tempo : 110;
    const e = Math.max(0.25, Math.min(1, energy ?? 0.55));
    const beatHz = bpm / 60; // beats per second
    const start = performance.now();

    const loop = (now: number) => {
      const t = (now - start) / 1000;
      for (let i = 0; i < barRefs.current.length; i++) {
        const el = barRefs.current[i];
        if (!el) continue;
        const phase = (i / barRefs.current.length) * Math.PI * 1.4;
        // Two harmonics so taller bars feel musical, not metronomic
        const wave =
          0.55 + 0.35 * Math.sin(2 * Math.PI * beatHz * t + phase) +
          0.18 * Math.sin(4 * Math.PI * beatHz * t + phase * 1.7);
        const h = Math.max(0.18, Math.min(1, wave * (0.55 + 0.55 * e)));
        el.style.transform = `scaleY(${h})`;
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [tempo, energy, isPlaying]);

  return (
    <span
      ref={containerRef}
      className={cn('inline-flex items-end gap-[2px] flex-shrink-0', className)}
      style={{ height }}
      aria-hidden="true"
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={(el) => (barRefs.current[i] = el)}
          className="w-[2px] rounded-full origin-bottom"
          style={{
            height: '100%',
            background: color,
            transform: 'scaleY(0.3)',
            transition: 'transform 90ms linear',
            willChange: 'transform',
          }}
        />
      ))}
    </span>
  );
}
