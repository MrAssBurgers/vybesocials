import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useState, useMemo, useCallback, forwardRef, memo } from 'react';
import { Check } from 'lucide-react';

type SwooshDirection = 
  | 'left' 
  | 'right' 
  | 'top' 
  | 'bottom' 
  | 'diagonal-tl' 
  | 'diagonal-tr' 
  | 'diagonal-bl' 
  | 'diagonal-br'
  | 'center';

interface NanotechSwooshProps {
  isActive: boolean;
  primaryColor?: string;
  accentColor?: string;
  onComplete?: () => void;
  onMidpoint?: () => void;
  duration?: number;
}

/**
 * Premium nanotech swoosh theme transition
 * Uses forwardRef to prevent React warnings when parent components pass refs
 */
export const NanotechSwoosh = memo(forwardRef<HTMLDivElement, NanotechSwooshProps>(function NanotechSwoosh({
  isActive,
  primaryColor = '280 70% 50%',
  accentColor = '330 80% 60%',
  onComplete,
  onMidpoint,
  duration = 700,
}, ref) {
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<'idle' | 'swoosh' | 'settle'>('idle');

  // Pick a random direction when animation starts
  const direction = useMemo<SwooshDirection>(() => {
    if (!isActive) return 'right';
    const directions: SwooshDirection[] = [
      'left', 'right', 'top', 'bottom',
      'diagonal-tl', 'diagonal-tr', 'diagonal-bl', 'diagonal-br',
      'center'
    ];
    return directions[Math.floor(Math.random() * directions.length)];
  }, [isActive]);

  // Get animation properties based on direction
  const getAnimationProps = useCallback(() => {
    const swooshDuration = duration / 1000;
    
    switch (direction) {
      case 'left':
        return {
          initial: { x: '-100%', y: 0 },
          animate: { x: '100%', y: 0 },
          gradient: 'to right',
        };
      case 'right':
        return {
          initial: { x: '100%', y: 0 },
          animate: { x: '-100%', y: 0 },
          gradient: 'to left',
        };
      case 'top':
        return {
          initial: { x: 0, y: '-100%' },
          animate: { x: 0, y: '100%' },
          gradient: 'to bottom',
        };
      case 'bottom':
        return {
          initial: { x: 0, y: '100%' },
          animate: { x: 0, y: '-100%' },
          gradient: 'to top',
        };
      case 'diagonal-tl':
        return {
          initial: { x: '-100%', y: '-100%' },
          animate: { x: '100%', y: '100%' },
          gradient: 'to bottom right',
        };
      case 'diagonal-tr':
        return {
          initial: { x: '100%', y: '-100%' },
          animate: { x: '-100%', y: '100%' },
          gradient: 'to bottom left',
        };
      case 'diagonal-bl':
        return {
          initial: { x: '-100%', y: '100%' },
          animate: { x: '100%', y: '-100%' },
          gradient: 'to top right',
        };
      case 'diagonal-br':
        return {
          initial: { x: '100%', y: '100%' },
          animate: { x: '-100%', y: '-100%' },
          gradient: 'to top left',
        };
      case 'center':
        return {
          initial: { scale: 0, opacity: 0 },
          animate: { scale: 2.5, opacity: [0, 1, 1, 0] },
          gradient: 'radial',
          isRadial: true,
        };
      default:
        return {
          initial: { x: '-100%', y: 0 },
          animate: { x: '100%', y: 0 },
          gradient: 'to right',
        };
    }
  }, [direction, duration]);

  const animProps = getAnimationProps();
  const swooshDuration = duration / 1000;

  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      return;
    }

    setPhase('swoosh');
    
    // Call onMidpoint when swoosh is at center (for theme change)
    const midpointTimer = setTimeout(() => {
      onMidpoint?.();
    }, duration * 0.4); // 40% through animation

    // Transition to settle phase
    const settleTimer = setTimeout(() => {
      setPhase('settle');
    }, duration * 0.85);

    // Complete animation
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, duration + 800); // Extra time for settle effect

    return () => {
      clearTimeout(midpointTimer);
      clearTimeout(settleTimer);
      clearTimeout(completeTimer);
    };
  }, [isActive, duration, onMidpoint, onComplete]);

  // Reduced motion: instant transition
  if (prefersReducedMotion) {
    return (
      <AnimatePresence>
        {isActive && (
          <motion.div
            className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              className="flex items-center gap-3 px-6 py-4 rounded-2xl bg-background/90 border border-primary/30 backdrop-blur-xl"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <div 
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, hsl(${primaryColor}), hsl(${accentColor}))` }}
              >
                <Check className="w-4 h-4 text-white" />
              </div>
              <span className="font-medium">Theme Applied</span>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  const isRadial = (animProps as any).isRadial;

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Fire spread from all edges */}
          
          {/* Top edge fire */}
          <motion.div
            className="absolute top-0 left-0 right-0"
            style={{
              height: '100vh',
              background: `linear-gradient(
                to bottom,
                hsl(${primaryColor} / 0.5) 0%,
                hsl(${primaryColor} / 0.3) 10%,
                hsl(${accentColor} / 0.2) 25%,
                hsl(${primaryColor} / 0.1) 40%,
                transparent 60%
              )`,
              filter: 'blur(30px)',
            }}
            initial={{ y: '-100%', opacity: 0 }}
            animate={{ y: '0%', opacity: [0, 1, 1, 0] }}
            transition={{
              duration: swooshDuration,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Bottom edge fire */}
          <motion.div
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: '100vh',
              background: `linear-gradient(
                to top,
                hsl(${accentColor} / 0.5) 0%,
                hsl(${accentColor} / 0.3) 10%,
                hsl(${primaryColor} / 0.2) 25%,
                hsl(${accentColor} / 0.1) 40%,
                transparent 60%
              )`,
              filter: 'blur(30px)',
            }}
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: [0, 1, 1, 0] }}
            transition={{
              duration: swooshDuration,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Left edge fire */}
          <motion.div
            className="absolute top-0 bottom-0 left-0"
            style={{
              width: '100vw',
              background: `linear-gradient(
                to right,
                hsl(${primaryColor} / 0.5) 0%,
                hsl(${accentColor} / 0.3) 10%,
                hsl(${primaryColor} / 0.2) 25%,
                hsl(${accentColor} / 0.1) 40%,
                transparent 60%
              )`,
              filter: 'blur(30px)',
            }}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
            transition={{
              duration: swooshDuration,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Right edge fire */}
          <motion.div
            className="absolute top-0 bottom-0 right-0"
            style={{
              width: '100vw',
              background: `linear-gradient(
                to left,
                hsl(${accentColor} / 0.5) 0%,
                hsl(${primaryColor} / 0.3) 10%,
                hsl(${accentColor} / 0.2) 25%,
                hsl(${primaryColor} / 0.1) 40%,
                transparent 60%
              )`,
              filter: 'blur(30px)',
            }}
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: '0%', opacity: [0, 1, 1, 0] }}
            transition={{
              duration: swooshDuration,
              ease: [0.22, 1, 0.36, 1],
            }}
          />

          {/* Center convergence glow */}
          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 0] }}
            transition={{
              duration: swooshDuration,
              times: [0, 0.3, 0.5, 1],
              ease: 'easeOut',
            }}
          >
            <motion.div
              style={{
                width: '150vmax',
                height: '150vmax',
                background: `radial-gradient(
                  circle,
                  hsl(${primaryColor} / 0.15) 0%,
                  hsl(${accentColor} / 0.1) 20%,
                  transparent 50%
                )`,
                filter: 'blur(60px)',
              }}
              initial={{ scale: 0.3 }}
              animate={{ scale: [0.3, 1.2] }}
              transition={{
                duration: swooshDuration * 0.8,
                delay: swooshDuration * 0.2,
                ease: [0.22, 1, 0.36, 1],
              }}
            />
          </motion.div>

          {/* Outline glow ring that expands */}
          <motion.div
            className="absolute inset-0"
            style={{
              boxShadow: `
                inset 0 0 100px 50px hsl(${primaryColor} / 0.3),
                inset 0 0 200px 100px hsl(${accentColor} / 0.15)
              `,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{
              duration: swooshDuration,
              ease: 'easeOut',
            }}
          />

          {/* UI Settle Glow Effect */}
          <AnimatePresence>
            {phase === 'settle' && (
              <motion.div
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                {/* Subtle edge glow */}
                <motion.div
                  className="absolute inset-0"
                  style={{
                    boxShadow: `inset 0 0 100px 20px hsl(${primaryColor} / 0.1)`,
                  }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      )}
    </AnimatePresence>
  );
}));
