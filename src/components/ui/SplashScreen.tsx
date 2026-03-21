import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

/**
 * Ultra-clean VYBE splash screen.
 * - Minimal: logo + thin progress line, nothing else
 * - DOM-ref driven progress (zero re-renders)
 * - GPU-composited animations only (transform/opacity)
 * - Smooth cubic-bezier exit
 */
export const SplashScreen = memo(function SplashScreen({ 
  isVisible, 
  status = 'Loading...', 
  progress = 0 
}: SplashScreenProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  // Drive progress bar via DOM ref — zero re-renders
  useEffect(() => {
    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${progress / 100})`;
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
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background"
          style={{ zIndex: 2147483647 }}
        >
          {/* Subtle ambient glow — single radial, GPU layer */}
          <div
            className="absolute pointer-events-none will-change-transform"
            style={{
              top: '45%',
              left: '50%',
              width: '420px',
              height: '420px',
              transform: 'translate(-50%, -50%)',
              background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 65%)',
              opacity: 0.7,
            }}
          />

          {/* Logo — clean V with draw-in animation */}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mb-10"
          >
            <svg
              viewBox="0 0 100 100"
              fill="none"
              className="w-16 h-16 sm:w-20 sm:h-20"
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
              </defs>
              <path
                d="M18 12 L50 88"
                stroke="url(#sp-l)"
                strokeWidth="13"
                strokeLinecap="round"
                className="splash-draw-left"
              />
              <path
                d="M82 12 L50 88"
                stroke="url(#sp-r)"
                strokeWidth="13"
                strokeLinecap="round"
                className="splash-draw-right"
              />
              <circle cx="50" cy="88" r="3.5" className="splash-dot" />
            </svg>
          </motion.div>

          {/* Brand name — gradient text, fades in after logo draws */}
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl sm:text-3xl font-display font-black tracking-tight mb-10"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VYBE
          </motion.h1>

          {/* Progress — ultra-thin line, scaleX transform for 60fps */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4, ease: 'easeOut' }}
            className="w-40 sm:w-48"
          >
            <div className="relative h-[2px] bg-foreground/[0.06] rounded-full overflow-hidden">
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
                style={{
                  transform: 'scaleX(0)',
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                  transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
                  willChange: 'transform',
                }}
              />
            </div>

            <span
              ref={statusRef}
              className="block text-center mt-3 text-xs text-muted-foreground/60 transition-opacity duration-300"
            >
              {status}
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
