import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { Check, Sparkles } from 'lucide-react';

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
  onMidpoint?: () => void; // Called when swoosh reaches midpoint (apply theme here)
  duration?: number; // Total duration in ms (600-800 recommended)
}

/**
 * Premium nanotech swoosh theme transition
 * - Semi-transparent frosted-glass effect
 * - Glowing leading edge, dissolving trailing edge
 * - Theme changes occur BEHIND the swoosh
 * - Respects prefers-reduced-motion
 */
export function NanotechSwoosh({
  isActive,
  primaryColor = '280 70% 50%',
  accentColor = '330 80% 60%',
  onComplete,
  onMidpoint,
  duration = 700,
}: NanotechSwooshProps) {
  const prefersReducedMotion = useReducedMotion();
  const [showSuccess, setShowSuccess] = useState(false);
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
      setShowSuccess(false);
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
      setShowSuccess(true);
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
          transition={{ duration: 0.2 }}
        >
          {/* Main Swoosh Layer - Frosted Glass with Gradient */}
          {isRadial ? (
            // Center burst animation
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="rounded-full"
                style={{
                  width: '200vmax',
                  height: '200vmax',
                  background: `radial-gradient(
                    circle,
                    hsl(${primaryColor} / 0.15) 0%,
                    hsl(${accentColor} / 0.1) 30%,
                    transparent 60%
                  )`,
                  backdropFilter: 'blur(20px) saturate(1.5)',
                  WebkitBackdropFilter: 'blur(20px) saturate(1.5)',
                }}
                initial={animProps.initial}
                animate={animProps.animate}
                transition={{
                  duration: swooshDuration,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
              {/* Glowing center ring */}
              <motion.div
                className="absolute rounded-full"
                style={{
                  width: '100vmax',
                  height: '100vmax',
                  background: `radial-gradient(
                    circle,
                    transparent 40%,
                    hsl(${primaryColor} / 0.4) 45%,
                    hsl(${primaryColor} / 0.6) 50%,
                    hsl(${accentColor} / 0.4) 55%,
                    transparent 60%
                  )`,
                  boxShadow: `0 0 100px 50px hsl(${primaryColor} / 0.3)`,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ 
                  scale: [0, 2.5], 
                  opacity: [0, 0.8, 0],
                }}
                transition={{
                  duration: swooshDuration * 0.9,
                  ease: [0.22, 1, 0.36, 1],
                }}
              />
            </motion.div>
          ) : (
            // Directional swoosh animation - SMOOTH & FLUID
            <>
              {/* Soft ambient glow that precedes the main swoosh */}
              <motion.div
                className="absolute inset-0"
                style={{
                  background: `radial-gradient(
                    ellipse 150% 100% at 50% 50%,
                    hsl(${primaryColor} / 0.08) 0%,
                    hsl(${accentColor} / 0.04) 40%,
                    transparent 70%
                  )`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{
                  duration: swooshDuration * 1.2,
                  ease: [0.4, 0, 0.2, 1],
                }}
              />

              {/* Main flowing wave - ultra smooth gradients */}
              <motion.div
                className="absolute"
                style={{
                  width: direction.includes('diagonal') ? '300%' : (direction === 'top' || direction === 'bottom') ? '100%' : '120%',
                  height: direction.includes('diagonal') ? '300%' : (direction === 'left' || direction === 'right') ? '100%' : '120%',
                  background: `linear-gradient(
                    ${animProps.gradient},
                    transparent 0%,
                    hsl(${primaryColor} / 0.03) 10%,
                    hsl(${primaryColor} / 0.12) 25%,
                    hsl(${accentColor} / 0.18) 40%,
                    hsl(${primaryColor} / 0.2) 50%,
                    hsl(${accentColor} / 0.15) 60%,
                    hsl(${primaryColor} / 0.08) 75%,
                    hsl(${accentColor} / 0.02) 90%,
                    transparent 100%
                  )`,
                  backdropFilter: 'blur(80px) saturate(1.3)',
                  WebkitBackdropFilter: 'blur(80px) saturate(1.3)',
                  borderRadius: '50%',
                  ...(direction === 'top' || direction === 'bottom' 
                    ? { left: '-10%', right: '-10%', top: direction === 'top' ? 0 : 'auto', bottom: direction === 'bottom' ? 0 : 'auto' }
                    : { top: '-10%', bottom: '-10%', left: direction === 'left' ? 0 : 'auto', right: direction === 'right' ? 0 : 'auto' }
                  ),
                }}
                initial={animProps.initial}
                animate={animProps.animate}
                transition={{
                  duration: swooshDuration,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
              />

              {/* Luminous leading edge - soft glow */}
              <motion.div
                className="absolute"
                style={{
                  width: direction.includes('diagonal') ? '300%' : (direction === 'top' || direction === 'bottom') ? '100%' : '60px',
                  height: direction.includes('diagonal') ? '60px' : (direction === 'left' || direction === 'right') ? '100%' : '60px',
                  background: `linear-gradient(
                    ${animProps.gradient},
                    transparent 0%,
                    hsl(${primaryColor} / 0.4) 20%,
                    hsl(${accentColor} / 0.6) 50%,
                    hsl(${primaryColor} / 0.4) 80%,
                    transparent 100%
                  )`,
                  boxShadow: `
                    0 0 80px 40px hsl(${primaryColor} / 0.25),
                    0 0 160px 80px hsl(${accentColor} / 0.15)
                  `,
                  filter: 'blur(12px)',
                  borderRadius: '100%',
                  ...(direction === 'top' || direction === 'bottom' 
                    ? { left: 0, right: 0 }
                    : { top: 0, bottom: 0 }
                  ),
                }}
                initial={animProps.initial}
                animate={animProps.animate}
                transition={{
                  duration: swooshDuration,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
              />

              {/* Secondary flowing ribbon */}
              <motion.div
                className="absolute"
                style={{
                  width: direction.includes('diagonal') ? '250%' : (direction === 'top' || direction === 'bottom') ? '100%' : '50%',
                  height: direction.includes('diagonal') ? '250%' : (direction === 'left' || direction === 'right') ? '100%' : '50%',
                  background: `linear-gradient(
                    ${animProps.gradient},
                    transparent 0%,
                    hsl(${accentColor} / 0.06) 20%,
                    hsl(${primaryColor} / 0.1) 50%,
                    hsl(${accentColor} / 0.06) 80%,
                    transparent 100%
                  )`,
                  backdropFilter: 'blur(50px)',
                  WebkitBackdropFilter: 'blur(50px)',
                  borderRadius: '50%',
                  ...(direction === 'top' || direction === 'bottom' 
                    ? { left: 0, right: 0, top: direction === 'top' ? 0 : 'auto', bottom: direction === 'bottom' ? 0 : 'auto' }
                    : { top: 0, bottom: 0, left: direction === 'left' ? 0 : 'auto', right: direction === 'right' ? 0 : 'auto' }
                  ),
                }}
                initial={animProps.initial}
                animate={animProps.animate}
                transition={{
                  duration: swooshDuration,
                  ease: [0.25, 0.1, 0.25, 1],
                  delay: swooshDuration * 0.08,
                }}
              />

              {/* Soft floating orbs instead of harsh particles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute"
                  style={{
                    width: 40 + Math.random() * 60,
                    height: 40 + Math.random() * 60,
                    background: `radial-gradient(circle at 30% 30%, 
                      hsl(${i % 2 === 0 ? primaryColor : accentColor} / 0.3) 0%,
                      hsl(${i % 2 === 0 ? primaryColor : accentColor} / 0.1) 40%,
                      transparent 70%
                    )`,
                    borderRadius: '50%',
                    filter: 'blur(8px)',
                    top: `${15 + Math.random() * 70}%`,
                    left: `${15 + Math.random() * 70}%`,
                  }}
                  initial={{ 
                    scale: 0, 
                    opacity: 0,
                    x: direction.includes('left') || direction.includes('tl') || direction.includes('bl') ? -100 : 100,
                  }}
                  animate={{ 
                    scale: [0, 1.5, 0],
                    opacity: [0, 0.8, 0],
                    x: 0,
                    y: [0, (Math.random() - 0.5) * 80],
                  }}
                  transition={{
                    duration: swooshDuration * 0.8,
                    delay: swooshDuration * 0.2 + i * 0.04,
                    ease: [0.4, 0, 0.2, 1],
                  }}
                />
              ))}
            </>
          )}

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

          {/* Success confirmation */}
          <AnimatePresence>
            {showSuccess && (
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <motion.div
                  className="flex flex-col items-center gap-3 p-6 rounded-3xl"
                  style={{
                    background: `linear-gradient(135deg, 
                      hsl(${primaryColor} / 0.15), 
                      hsl(${accentColor} / 0.1)
                    )`,
                    backdropFilter: 'blur(24px) saturate(1.5)',
                    WebkitBackdropFilter: 'blur(24px) saturate(1.5)',
                    border: `1px solid hsl(${primaryColor} / 0.3)`,
                    boxShadow: `
                      0 0 40px hsl(${primaryColor} / 0.2),
                      0 20px 40px -20px hsl(${primaryColor} / 0.3)
                    `,
                  }}
                  initial={{ scale: 0.8, y: 20, opacity: 0 }}
                  animate={{ 
                    scale: 1, 
                    y: 0, 
                    opacity: 1,
                  }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ 
                    type: 'spring', 
                    damping: 20, 
                    stiffness: 300,
                  }}
                >
                  {/* Success icon with micro-lift animation */}
                  <motion.div
                    className="w-14 h-14 rounded-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, hsl(${primaryColor}), hsl(${accentColor}))`,
                      boxShadow: `0 0 30px hsl(${primaryColor} / 0.5)`,
                    }}
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ 
                      scale: [0, 1.1, 1],
                      rotate: 0,
                    }}
                    transition={{ 
                      type: 'spring',
                      damping: 12,
                      delay: 0.1,
                    }}
                  >
                    <Check className="w-7 h-7 text-white" strokeWidth={3} />
                  </motion.div>

                  <motion.div 
                    className="text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <p className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                      Theme Applied
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 justify-center mt-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Nanotech rebuild complete
                    </p>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
