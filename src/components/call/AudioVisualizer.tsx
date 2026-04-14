import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface AudioVisualizerProps {
  /** Size in px of the ring diameter */
  size?: number;
  /** MediaStream to analyze (remote audio) */
  stream?: MediaStream | null;
  /** Whether to show the visualizer */
  active?: boolean;
}

/**
 * Renders animated bars in a circular ring that react to audio levels.
 * Falls back to a gentle pulse animation when no stream is provided.
 */
export function AudioVisualizer({ size = 180, stream, active = true }: AudioVisualizerProps) {
  const [levels, setLevels] = useState<number[]>(Array(16).fill(0.15));
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active || !stream) return;

    let ctx: AudioContext;
    try {
      ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;
      sourceRef.current = source;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        // Pick 16 evenly spaced bins
        const newLevels: number[] = [];
        const step = Math.floor(dataArray.length / 16);
        for (let i = 0; i < 16; i++) {
          newLevels.push(Math.max(0.1, dataArray[i * step] / 255));
        }
        setLevels(newLevels);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      return () => {
        cancelAnimationFrame(rafRef.current);
        source.disconnect();
        ctx.close();
      };
    } catch {
      // AudioContext not available — use fallback
      return;
    }
  }, [stream, active]);

  // Fallback animated levels when no stream
  useEffect(() => {
    if (stream || !active) return;
    const interval = setInterval(() => {
      setLevels(Array(16).fill(0).map(() => 0.1 + Math.random() * 0.25));
    }, 200);
    return () => clearInterval(interval);
  }, [stream, active]);

  const barCount = 16;
  const radius = size / 2 - 8;

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full">
        {levels.map((level, i) => {
          const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
          const barHeight = 8 + level * 24;
          const cx = size / 2 + Math.cos(angle) * radius;
          const cy = size / 2 + Math.sin(angle) * radius;
          const deg = (angle * 180) / Math.PI + 90;

          return (
            <rect
              key={i}
              x={cx - 2}
              y={cy - barHeight / 2}
              width={4}
              height={barHeight}
              rx={2}
              fill="hsl(var(--primary))"
              opacity={0.4 + level * 0.5}
              transform={`rotate(${deg}, ${cx}, ${cy})`}
              style={{ transition: 'height 0.15s ease-out, opacity 0.15s ease-out' }}
            />
          );
        })}
      </svg>
    </div>
  );
}
