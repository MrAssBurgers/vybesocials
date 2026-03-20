import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

/**
 * High-performance splash screen.
 * - Progress bar animated via CSS transitions (no React re-renders)
 * - GPU-composited layers (transform/opacity only)
 * - Single CSS animation for shimmer (no framer-motion overhead)
 */
export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  // Drive progress bar + percentage via DOM refs — zero re-renders
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.width = `${progress}%`;
    }
    if (pctRef.current) {
      pctRef.current.textContent = `${Math.round(progress)}%`;
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
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background"
          style={{ zIndex: 2147483647 }}
        >
          {/* Soft ambient glow — GPU-composited, no blur filter */}
          <div
            className="absolute top-1/2 left-1/2 w-[500px] h-[500px] rounded-full pointer-events-none will-change-transform"
            style={{
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.25) 0%, hsl(var(--accent) / 0.1) 50%, transparent 70%)',
              opacity: 0.6,
            }}
          />

          {/* Logo — clean CSS draw animation */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6"
          >
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-20 h-20 sm:w-28 sm:h-28"
              style={{ filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.3))' }}
            >
              <defs>
                <linearGradient id="splash-left" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--neon-purple, var(--primary)))" />
                </linearGradient>
                <linearGradient id="splash-right" x1="100%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--accent))" />
                  <stop offset="100%" stopColor="hsl(var(--neon-cyan, var(--accent)))" />
                </linearGradient>
              </defs>
              <path
                d="M18 12 L50 88"
                stroke="url(#splash-left)"
                strokeWidth="14"
                strokeLinecap="round"
                className="splash-draw-left"
              />
              <path
                d="M82 12 L50 88"
                stroke="url(#splash-right)"
                strokeWidth="14"
                strokeLinecap="round"
                className="splash-draw-right"
              />
              <circle cx="50" cy="88" r="4" className="splash-dot" />
            </svg>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl font-display font-black tracking-tight mb-8"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VYBE
          </motion.h1>

          {/* Progress bar — CSS transition driven, no React state */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="w-52 sm:w-64"
          >
            <div className="relative h-1.5 bg-muted/40 rounded-full overflow-hidden">
              {/* CSS shimmer */}
              <div className="absolute inset-0 splash-shimmer" />
              {/* Fill bar */}
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: '0%',
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                  transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                  willChange: 'width',
                }}
              />
            </div>

            <div className="flex flex-col items-center mt-3 gap-0.5">
              <span
                ref={statusRef}
                className="text-sm font-medium text-foreground/70 transition-opacity duration-200"
              >
                {status}
              </span>
              <span
                ref={pctRef}
                className="text-xs tabular-nums text-muted-foreground"
              >
                0%
              </span>
            </div>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="absolute bottom-8 text-[10px] sm:text-xs text-muted-foreground tracking-widest uppercase"
          >
            Your vibe, your way
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
