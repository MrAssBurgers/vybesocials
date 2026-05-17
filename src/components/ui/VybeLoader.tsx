import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VYBE_TIPS as TIPS } from './vybeTips';

interface VybeLoaderProps {
  className?: string;
  /** Delay before showing (ms). Prevents flash on fast loads. Default 350. */
  delay?: number;
}

function LoaderContents() {
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % TIPS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      {/* Breathing logo */}
      <motion.div
        data-allow-animation="true"
        animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
        className="relative flex items-center justify-center"
        style={{ width: 96, height: 96 }}
      >
        {/* Soft glow pulsing on same cadence */}
        <motion.div
          aria-hidden
          animate={{ opacity: [0.35, 0.65, 0.35], scale: [0.9, 1.15, 0.9] }}
          transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle, hsl(var(--primary) / 0.35) 0%, hsl(var(--accent) / 0.12) 45%, transparent 70%)',
            filter: 'blur(8px)',
          }}
        />
        <svg viewBox="-5 -5 110 110" fill="none" style={{ width: 80, height: 80, position: 'relative' }}>
          <defs>
            <linearGradient id="vl-l" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--neon-purple, var(--primary)))" />
            </linearGradient>
            <linearGradient id="vl-r" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="hsl(var(--accent))" />
              <stop offset="100%" stopColor="hsl(var(--neon-cyan, var(--accent)))" />
            </linearGradient>
            <filter id="vl-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path d="M18 15 L50 85" stroke="url(#vl-l)" strokeWidth="11" strokeLinecap="round" filter="url(#vl-glow)" />
          <path d="M82 15 L50 85" stroke="url(#vl-r)" strokeWidth="11" strokeLinecap="round" filter="url(#vl-glow)" />
        </svg>
      </motion.div>

      {/* Rotating tip */}
      <div className="w-[min(22rem,80vw)] min-h-[3.5rem] text-center flex flex-col items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/60 font-semibold">
          Tip
        </span>
        <AnimatePresence mode="wait">
          <motion.p
            key={tipIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="text-sm text-muted-foreground/85 leading-snug"
          >
            {TIPS[tipIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Centered breathing VYBE loader with rotating tips.
 * Use inside a section / panel that's loading.
 */
export const VybeLoader = memo(function VybeLoader({ className, delay = 350 }: VybeLoaderProps) {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!show) return null;

  return (
    <div className={cn('flex-1 flex items-center justify-center min-h-[40vh] py-12', className)}>
      <LoaderContents />
    </div>
  );
});

/**
 * Full-page breathing VYBE loader. Used as Suspense fallback for routes.
 */
export const VybePageLoader = memo(function VybePageLoader({ delay = 350 }: { delay?: number }) {
  const [show, setShow] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  if (!show) return <div className="min-h-screen" />;

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoaderContents />
    </div>
  );
});
