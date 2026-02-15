import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { cn } from '@/lib/utils';
import { Check, Sparkles } from 'lucide-react';

interface VybeGenerationAnimationProps {
  isGenerating: boolean;
  buildPhase: number;
  phases: Array<{ label: string; icon: React.ElementType; duration: number }>;
  onBuildComplete?: () => void;
}

// Pulsing ring layers that dissolve as progress increases
function ProgressRings({ progress }: { progress: number }) {
  return (
    <>
      {/* Inner shimmer ring */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(
            from 0deg,
            hsl(var(--primary) / ${0.6 * (1 - progress / 100)}),
            hsl(var(--accent) / ${0.4 * (1 - progress / 100)}),
            transparent 40%,
            hsl(var(--primary) / ${0.6 * (1 - progress / 100)})
          )`,
          mask: 'radial-gradient(circle, transparent 60%, black 62%, black 68%, transparent 70%)',
          WebkitMask: 'radial-gradient(circle, transparent 60%, black 62%, black 68%, transparent 70%)',
        }}
      />
      {/* Outer glow ring */}
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        className="absolute -inset-3 rounded-full"
        style={{
          background: `conic-gradient(
            from 180deg,
            hsl(var(--accent) / ${0.3 * (1 - progress / 100)}),
            transparent 30%,
            hsl(var(--primary) / ${0.3 * (1 - progress / 100)}),
            transparent 70%
          )`,
          filter: 'blur(6px)',
        }}
      />
    </>
  );
}

// Orbiting dots
function OrbitingDots({ isComplete }: { isComplete: boolean }) {
  if (isComplete) return null;

  return (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          animate={{ rotate: 360 }}
          transition={{
            duration: 3 + i * 0.4,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 pointer-events-none"
        >
          <motion.div
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: i * 0.25,
            }}
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              top: -3,
              left: 'calc(50% - 3px)',
              background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
              boxShadow: `0 0 8px ${i % 2 === 0 ? 'hsl(var(--primary) / 0.6)' : 'hsl(var(--accent) / 0.6)'}`,
            }}
          />
        </motion.div>
      ))}
    </>
  );
}

// Completion burst particles
function CompletionBurst({ show }: { show: boolean }) {
  if (!show) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * 360;
        const dist = 60 + Math.random() * 40;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
            animate={{
              opacity: [1, 0.8, 0],
              scale: [0, 1.2, 0.3],
              x: Math.cos((angle * Math.PI) / 180) * dist,
              y: Math.sin((angle * Math.PI) / 180) * dist,
            }}
            transition={{ duration: 0.7, delay: Math.random() * 0.15, ease: 'easeOut' }}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 4 + Math.random() * 6,
              height: 4 + Math.random() * 6,
              marginLeft: -3,
              marginTop: -3,
              background: i % 2 === 0 ? 'hsl(var(--primary))' : 'hsl(var(--accent))',
              boxShadow: `0 0 6px ${i % 2 === 0 ? 'hsl(var(--primary) / 0.5)' : 'hsl(var(--accent) / 0.5)'}`,
            }}
          />
        );
      })}
    </div>
  );
}

export const VybeGenerationAnimation = memo(function VybeGenerationAnimation({
  isGenerating,
  buildPhase,
  phases,
  onBuildComplete,
}: VybeGenerationAnimationProps) {
  const [progress, setProgress] = useState(0);
  const [showBurst, setShowBurst] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!isGenerating) {
      setProgress(0);
      setShowBurst(false);
      setIsComplete(false);
      return;
    }

    const targetProgress = ((buildPhase + 1) / phases.length) * 100;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const diff = targetProgress - prev;
        if (Math.abs(diff) < 1) {
          if (targetProgress >= 100 && !isComplete) {
            setIsComplete(true);
            setShowBurst(true);
            onBuildComplete?.();
          }
          return targetProgress;
        }
        return prev + diff * 0.12;
      });
    }, 40);

    return () => clearInterval(interval);
  }, [isGenerating, buildPhase, phases.length, isComplete, onBuildComplete]);

  return (
    <motion.div
      key="building"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      className="relative z-10 h-full flex flex-col items-center justify-center p-6"
    >
      {/* Central orb */}
      <div className="relative mb-12" style={{ width: 160, height: 160 }}>
        {/* Ambient glow */}
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.4, 0.7, 0.4],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -inset-6 rounded-full"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary) / 0.25), hsl(var(--accent) / 0.15), transparent 70%)',
          }}
        />

        {/* Progress ring (circular arc) */}
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 160 160">
          {/* Track */}
          <circle
            cx="80" cy="80" r="76"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="3"
            opacity={0.3}
          />
          {/* Progress arc */}
          <motion.circle
            cx="80" cy="80" r="76"
            fill="none"
            stroke="url(#progressGrad)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 76}
            strokeDashoffset={2 * Math.PI * 76 * (1 - progress / 100)}
            style={{ filter: 'drop-shadow(0 0 4px hsl(var(--primary) / 0.5))' }}
          />
          <defs>
            <linearGradient id="progressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--accent))" />
            </linearGradient>
          </defs>
        </svg>

        {/* Spinning rings effect */}
        <ProgressRings progress={progress} />

        {/* Inner orb background */}
        <div className="absolute inset-2 rounded-full bg-background border border-border/50 overflow-hidden flex items-center justify-center">
          {/* Inner gradient that intensifies with progress */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: `radial-gradient(circle at 40% 40%, hsl(var(--primary) / ${0.08 + (progress / 100) * 0.12}), transparent 60%)`,
            }}
          />

          {/* VYBE icon reveal */}
          <motion.div
            animate={{
              opacity: Math.min(1, progress / 40),
              scale: 0.85 + (progress / 100) * 0.15,
            }}
            transition={{ duration: 0.3 }}
            className="relative z-10"
          >
            <VybeMiniIcon size={56} showSparkles={isComplete} />
          </motion.div>
        </div>

        {/* Orbiting dots */}
        <OrbitingDots isComplete={isComplete} />

        {/* Completion burst */}
        <CompletionBurst show={showBurst} />
      </div>

      {/* Build phases list */}
      <div className="space-y-2.5 w-full max-w-sm">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const isActive = buildPhase === index;
          const isCompletePhase = buildPhase > index;

          return (
            <motion.div
              key={phase.label}
              initial={{ opacity: 0, x: -20 }}
              animate={{
                opacity: isActive || isCompletePhase ? 1 : 0.3,
                x: 0,
              }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                'flex items-center gap-3 p-2.5 rounded-xl transition-all duration-300',
                isActive && 'bg-primary/10 border border-primary/20',
                isCompletePhase && 'text-primary'
              )}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300',
                  isActive && 'bg-primary text-primary-foreground shadow-md shadow-primary/20',
                  isCompletePhase && 'bg-primary/20 text-primary',
                  !isActive && !isCompletePhase && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompletePhase ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Icon className={cn('h-4 w-4', isActive && 'animate-pulse')} />
                )}
              </div>
              <span
                className={cn(
                  'text-sm font-medium flex-1',
                  isActive && 'text-foreground font-semibold',
                  isCompletePhase && 'text-foreground/80',
                  !isActive && !isCompletePhase && 'text-foreground/40'
                )}
              >
                {phase.label}
              </span>
              {isActive && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                >
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Progress percentage */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-6 text-center"
      >
        <motion.span
          className="text-2xl font-bold text-primary tabular-nums"
          animate={isComplete ? { scale: [1, 1.2, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          {Math.round(progress)}%
        </motion.span>
        {isComplete && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground mt-2"
          >
            Your VYBE is ready! ✨
          </motion.p>
        )}
      </motion.div>
    </motion.div>
  );
});
