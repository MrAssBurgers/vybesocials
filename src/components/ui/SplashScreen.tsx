import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

/**
 * Premium animated VYBE splash screen.
 * - Floating particle orbs for depth
 * - Breathing glow behind logo
 * - SVG draw-in logo with staggered strokes
 * - Smooth gradient progress bar with glow
 * - DOM-ref driven for zero re-renders on progress updates
 */
export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);

  // Drive progress bar via DOM ref — zero re-renders
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${progress / 100})`;
    }
    if (percentRef.current) {
      percentRef.current.textContent = `${Math.round(progress)}%`;
    }
    // Intensify glow as progress increases
    if (glowRef.current) {
      const intensity = 0.4 + (progress / 100) * 0.4;
      glowRef.current.style.opacity = `${intensity}`;
    }
  }, [progress]);

  // Update status text without re-render
  useEffect(() => {
    if (statusRef.current) {
      statusRef.current.textContent = status;
    }
  }, [status]);

  // Lock scroll while visible
  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('splash-visible');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('splash-visible');
    };
  }, [isVisible]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background"
          style={{ zIndex: 2147483647 }}
        >
          {/* Floating particle orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute rounded-full"
              style={{
                width: 6, height: 6,
                top: '25%', left: '20%',
                background: 'hsl(var(--primary))',
                animation: 'splash-float-1 4s ease-in-out infinite',
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 4, height: 4,
                top: '35%', right: '25%',
                background: 'hsl(var(--accent))',
                animation: 'splash-float-2 5s ease-in-out infinite 0.5s',
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 5, height: 5,
                bottom: '30%', left: '30%',
                background: 'hsl(var(--primary))',
                animation: 'splash-float-3 3.5s ease-in-out infinite 1s',
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 3, height: 3,
                bottom: '25%', right: '20%',
                background: 'hsl(var(--accent))',
                animation: 'splash-float-1 4.5s ease-in-out infinite 1.5s',
              }}
            />
            <div
              className="absolute rounded-full"
              style={{
                width: 4, height: 4,
                top: '60%', left: '15%',
                background: 'hsl(var(--primary) / 0.6)',
                animation: 'splash-float-2 6s ease-in-out infinite 2s',
              }}
            />
          </div>

          {/* Breathing glow behind logo */}
          <div
            ref={glowRef}
            className="absolute pointer-events-none will-change-transform"
            style={{
              top: '42%',
              left: '50%',
              width: '350px',
              height: '350px',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, hsl(var(--accent) / 0.1) 40%, transparent 70%)',
              animation: 'splash-glow-breathe 3s ease-in-out infinite',
              opacity: 0.4,
            }}
          />

          {/* Logo — V with draw-in animation */}
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="mb-8 relative"
          >
            {/* Outer ring pulse */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.15, 1], opacity: [0, 0.3, 0] }}
              transition={{ delay: 0.9, duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute inset-[-16px] rounded-full border-2 border-primary/30"
            />
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-18 h-18 sm:w-22 sm:h-22"
              style={{ width: 72, height: 72 }}
            >
              <defs>
                <linearGradient id="sp-l" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--neon-purple, var(--primary)))" />
                </linearGradient>
                <linearGradient id="sp-r" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--accent))" />
                  <stop offset="100%" stopColor="hsl(var(--neon-cyan, var(--accent)))" />
                </linearGradient>
                <filter id="sp-glow">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path
                d="M18 12 L50 88"
                stroke="url(#sp-l)"
                strokeWidth="13"
                strokeLinecap="round"
                className="splash-draw-left"
                filter="url(#sp-glow)"
              />
              <path
                d="M82 12 L50 88"
                stroke="url(#sp-r)"
                strokeWidth="13"
                strokeLinecap="round"
                className="splash-draw-right"
                filter="url(#sp-glow)"
              />
              <circle cx="50" cy="88" r="4" className="splash-dot" />
            </svg>
          </motion.div>

          {/* Brand name — gradient text, staggered letter reveal */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl sm:text-3xl font-display font-black tracking-tight mb-8"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VYBE
          </motion.h1>

          {/* Progress section */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: 'easeOut' }}
            className="w-48 sm:w-56"
          >
            {/* Progress bar with glow */}
            <div className="relative h-[3px] bg-foreground/[0.08] rounded-full overflow-hidden">
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
                style={{
                  transform: 'scaleX(0)',
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                  backgroundSize: '200% 100%',
                  transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                  willChange: 'transform',
                  animation: 'splash-bar-glow 2s ease-in-out infinite',
                }}
              />
            </div>

            {/* Status + percentage */}
            <div className="flex items-center justify-between mt-3 px-0.5">
              <span
                ref={statusRef}
                className="text-[11px] text-muted-foreground/70 transition-opacity duration-300 truncate max-w-[70%]"
              >
                {status}
              </span>
              <span
                ref={percentRef}
                className="text-[11px] tabular-nums text-muted-foreground/50 font-medium"
              >
                {Math.round(progress)}%
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
