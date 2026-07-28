import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface VybeGenerationAnimationProps {
  isGenerating: boolean;
  buildPhase: number;
  phases: Array<{ label: string; icon: React.ElementType; duration: number }>;
  /** Live status from streaming theme patches — overrides phase label when set. */
  statusLabel?: string | null;
  onBuildComplete?: () => void;
}

/**
 * Premium build screen — single progress arc around the VYBE icon,
 * cross-fading phase labels. Replaces the multi-ring overlap.
 */
export const VybeGenerationAnimation = memo(function VybeGenerationAnimation({
  isGenerating,
  buildPhase,
  phases,
  statusLabel,
}: VybeGenerationAnimationProps) {
  const reduceMotion = useReducedMotion();
  const totalDuration = phases.reduce((sum, p) => sum + p.duration, 0);
  const [progress, setProgress] = useState(0);

  // Smoothly animate progress arc independent of buildPhase ticks
  useEffect(() => {
    if (!isGenerating) return;
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const elapsed = Date.now() - start;
      const next = Math.min(1, elapsed / totalDuration);
      setProgress(next);
      if (next < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isGenerating, totalDuration]);

  const currentPhase = phases[Math.min(buildPhase, phases.length - 1)];
  const PhaseIcon = currentPhase?.icon;

  // SVG arc geometry
  const size = 180;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="h-full w-full flex flex-col items-center justify-center px-6">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Track */}
        <svg
          width={size}
          height={size}
          className="absolute inset-0 -rotate-90"
          aria-hidden
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--muted) / 0.4)"
            strokeWidth={stroke}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{
              filter: 'drop-shadow(0 0 8px hsl(var(--primary) / 0.6))',
            }}
          />
        </svg>

        {/* Subtle pulsing glow behind icon */}
        {!reduceMotion && (
          <motion.div
            className="absolute inset-4 rounded-full bg-primary/20 blur-2xl"
            animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.9, 1.05, 0.9] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}

        {/* Center icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            animate={reduceMotion ? undefined : { rotate: [0, 6, -6, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <VybeMiniIcon size={64} showSparkles />
          </motion.div>
        </div>
      </div>

      {/* Progress percentage */}
      <div className="mt-6 mb-3 text-3xl font-bold text-foreground tracking-tight tabular-nums">
        {Math.round(progress * 100)}%
      </div>

      {/* Cross-fading phase label */}
      <div className="h-7 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentPhase && (
            <motion.div
              key={statusLabel || currentPhase.label}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              {PhaseIcon && <PhaseIcon className="h-4 w-4 text-primary" />}
              <span>{statusLabel || `${currentPhase.label}…`}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Phase dots */}
      <div className="mt-5 flex gap-1.5">
        {phases.map((_, i) => (
          <motion.div
            key={i}
            className="h-1 rounded-full bg-muted/50 overflow-hidden"
            animate={{ width: i === buildPhase ? 24 : 6 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
          >
            {i <= buildPhase && (
              <div className="h-full w-full bg-primary" />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
});
