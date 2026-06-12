import { memo, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface ClipVideoProgressProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  branded?: boolean;
  isMuted?: boolean;
}

const WAVE_BAR_COUNT = 8;
const AUDIO_CTX_KEY = '__vybeClipAudio';

type ClipAudioState = {
  ctx: AudioContext;
  analyser: AnalyserNode;
};

function getClipAudio(video: HTMLVideoElement): ClipAudioState | null {
  const cached = (video as HTMLVideoElement & { [AUDIO_CTX_KEY]?: ClipAudioState })[AUDIO_CTX_KEY];
  if (cached) return cached;

  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(video);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    const state = { ctx, analyser };
    (video as HTMLVideoElement & { [AUDIO_CTX_KEY]?: ClipAudioState })[AUDIO_CTX_KEY] = state;
    return state;
  } catch {
    return null;
  }
}

export const ClipVideoProgress = memo(function ClipVideoProgress({
  videoRef,
  isActive,
  branded = false,
  isMuted = true,
}: ClipVideoProgressProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const waveRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const rafRef = useRef<number | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);

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

    let audio: ClipAudioState | null = null;
    if (!isMuted) {
      audio = getClipAudio(video);
      audio?.ctx.resume().catch(() => {});
      if (audio) {
        freqDataRef.current = new Uint8Array(audio.analyser.frequencyBinCount);
      }
    }

    const tick = () => {
      const duration = video.duration;
      const progress =
        duration && Number.isFinite(duration) && duration > 0
          ? Math.min(Math.max(video.currentTime / duration, 0), 1)
          : 0;

      fill.style.transform = `scaleX(${progress})`;

      if (audio && freqDataRef.current && !video.paused && !isMuted) {
        audio.analyser.getByteFrequencyData(freqDataRef.current);
        const data = freqDataRef.current;
        const step = Math.max(1, Math.floor(data.length / WAVE_BAR_COUNT));

        for (let i = 0; i < WAVE_BAR_COUNT; i++) {
          const bar = waveRefs.current[i];
          if (!bar) continue;
          const sample = data[i * step] / 255;
          const height = 0.18 + sample * 0.82;
          bar.style.transform = `scaleY(${height})`;
          bar.style.opacity = `${0.35 + sample * 0.55}`;
        }
      } else {
        waveRefs.current.forEach((bar, i) => {
          if (!bar) return;
          const idle = 0.15 + Math.sin(Date.now() / 280 + i * 0.7) * 0.06;
          bar.style.transform = `scaleY(${idle})`;
          bar.style.opacity = '0.25';
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
