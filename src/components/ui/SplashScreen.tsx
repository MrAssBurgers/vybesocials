import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SplashScreenProps {
  isVisible: boolean;
  status?: string;
  progress?: number;
}

/**
 * Premium animated VYBE splash screen.
 * Uses DOM refs for zero re-renders on progress updates.
 * Properly contained within viewport to prevent cutoff on all devices.
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


  useEffect(() => {
    if (barRef.current) barRef.current.style.transform = `scaleX(${progress / 100})`;
    if (percentRef.current) percentRef.current.textContent = `${Math.round(progress)}%`;
    if (glowRef.current) glowRef.current.style.opacity = `${0.4 + (progress / 100) * 0.4}`;
  }, [progress]);

  useEffect(() => {
    if (statusRef.current) statusRef.current.textContent = status;
  }, [status]);

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
          className="fixed inset-0 flex flex-col items-center justify-center bg-background overflow-hidden"
          style={{ zIndex: 2147483647 }}
        >
          {/* Floating particle orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[
              { w: 6, h: 6, pos: { top: '25%', left: '20%' }, color: '--primary', anim: 'splash-float-1', dur: '4s', delay: '0s' },
              { w: 4, h: 4, pos: { top: '35%', right: '25%' }, color: '--accent', anim: 'splash-float-2', dur: '5s', delay: '0.5s' },
              { w: 5, h: 5, pos: { bottom: '30%', left: '30%' }, color: '--primary', anim: 'splash-float-3', dur: '3.5s', delay: '1s' },
              { w: 3, h: 3, pos: { bottom: '25%', right: '20%' }, color: '--accent', anim: 'splash-float-1', dur: '4.5s', delay: '1.5s' },
              { w: 4, h: 4, pos: { top: '60%', left: '15%' }, color: '--primary', anim: 'splash-float-2', dur: '6s', delay: '2s', opacity: 0.6 },
            ].map((p, i) => (
              <div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: p.w, height: p.h,
                  ...p.pos,
                  background: `hsl(var(${p.color})${p.opacity ? ` / ${p.opacity}` : ''})`,
                  animation: `${p.anim} ${p.dur} ease-in-out infinite ${p.delay}`,
                }}
              />
            ))}
          </div>

          {/* Breathing glow behind logo — uses min() to prevent overflow */}
          <div
            ref={glowRef}
            className="absolute pointer-events-none will-change-transform"
            style={{
              top: '50%', left: '50%',
              width: 'min(300px, 75vw)', height: 'min(300px, 75vw)',
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
            className="mb-6 relative flex items-center justify-center"
          >
            {/* Outer ring pulse */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [1, 1.15, 1], opacity: [0, 0.3, 0] }}
              transition={{ delay: 0.9, duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute rounded-full border-2 border-primary/30"
              style={{ width: 120, height: 120 }}
            />
            <svg
              viewBox="-5 -5 110 110"
              fill="none"
              style={{ width: 96, height: 96 }}
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
                <filter id="sp-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path d="M18 15 L50 85" stroke="url(#sp-l)" strokeWidth="11" strokeLinecap="round" className="splash-draw-left" filter="url(#sp-glow)" />
              <path d="M82 15 L50 85" stroke="url(#sp-r)" strokeWidth="11" strokeLinecap="round" className="splash-draw-right" filter="url(#sp-glow)" />
              <circle cx="50" cy="85" r="3.5" className="splash-dot" />
            </svg>
          </motion.div>

          {/* Brand name */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="text-2xl font-display font-black tracking-tight mb-5"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VYBE
          </motion.h1>

          {/* Progress section — constrained width */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.5, ease: 'easeOut' }}
            className="w-[min(16rem,72vw)]"
          >
            <div className="relative h-1.5 bg-foreground/[0.1] rounded-full overflow-hidden">
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
                style={{
                  transform: 'scaleX(0)',
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
                  backgroundSize: '200% 100%',
                  boxShadow: '0 0 12px hsl(var(--primary) / 0.45)',
                  transition: 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)',
                  willChange: 'transform',
                  animation: 'splash-bar-glow 2s ease-in-out infinite',
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2.5 px-0.5">
              <span ref={statusRef} className="text-[12px] text-muted-foreground/80 truncate max-w-[70%]">{status}</span>
              <span ref={percentRef} className="text-[12px] tabular-nums text-foreground/80 font-medium">{Math.round(progress)}%</span>
            </div>
          </motion.div>

        </motion.div>
      )}
    </AnimatePresence>
  );
});
