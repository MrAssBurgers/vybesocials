import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { subscribeSplashProgress } from '@/lib/splashProgressBridge';

interface SplashScreenProps {
  isVisible: boolean;
}

/**
 * Boot splash — progress updates via imperative bridge (no re-render per tick).
 * Keeps the app shell hidden until exit completes to avoid overlap glitches.
 */
export const SplashScreen = memo(function SplashScreen({ isVisible }: SplashScreenProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const percentRef = useRef<HTMLSpanElement>(null);
  const reduceMotion = isNativePerfMode();

  useEffect(() => {
    return subscribeSplashProgress((progress, status) => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${progress / 100})`;
      if (percentRef.current) percentRef.current.textContent = `${Math.round(progress)}%`;
      if (statusRef.current) statusRef.current.textContent = status;
    });
  }, []);

  useEffect(() => {
    if (isVisible) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('splash-visible');
      return () => {
        document.body.style.overflow = '';
        document.body.classList.remove('splash-visible');
      };
    }

    document.body.style.overflow = '';
    document.body.classList.remove('splash-visible');
    ensureAppShellVisible();
  }, [isVisible]);

  return (
    <AnimatePresence onExitComplete={ensureAppShellVisible}>
      {isVisible && (
        <motion.div
          key="vybe-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: 'easeOut' }}
          className="fixed inset-0 flex flex-col items-center justify-center bg-background overflow-hidden"
          style={{ zIndex: 2147483647 }}
        >
          {!reduceMotion && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-60">
              {[
                { w: 6, h: 6, top: '25%', left: '20%', color: '--primary', anim: 'splash-float-1', dur: '4s' },
                { w: 4, h: 4, top: '35%', right: '25%', color: '--accent', anim: 'splash-float-2', dur: '5s' },
              ].map((p, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    width: p.w,
                    height: p.h,
                    top: p.top,
                    left: p.left,
                    right: (p as { right?: string }).right,
                    background: `hsl(var(${p.color}))`,
                    animation: `${p.anim} ${p.dur} ease-in-out infinite`,
                  }}
                />
              ))}
            </div>
          )}

          <div
            className="absolute pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              width: 'min(260px, 70vw)',
              height: 'min(260px, 70vw)',
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle, hsl(var(--primary) / 0.22) 0%, hsl(var(--accent) / 0.08) 45%, transparent 70%)',
              opacity: reduceMotion ? 0.35 : 0.5,
            }}
          />

          <div className="mb-6 relative flex items-center justify-center">
            <svg viewBox="-5 -5 110 110" fill="none" style={{ width: 96, height: 96 }} aria-hidden>
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
                d="M18 15 L50 85"
                stroke="url(#sp-l)"
                strokeWidth="11"
                strokeLinecap="round"
                className={reduceMotion ? undefined : 'splash-draw-left'}
              />
              <path
                d="M82 15 L50 85"
                stroke="url(#sp-r)"
                strokeWidth="11"
                strokeLinecap="round"
                className={reduceMotion ? undefined : 'splash-draw-right'}
              />
              <circle cx="50" cy="85" r="3.5" fill="hsl(var(--primary))" className={reduceMotion ? undefined : 'splash-dot'} />
            </svg>
          </div>

          <h1
            className="text-2xl font-display font-black tracking-tight mb-5"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            VYBE
          </h1>

          <div className="w-[min(16rem,72vw)]">
            <div className="relative h-1.5 bg-foreground/[0.1] rounded-full overflow-hidden">
              <div
                ref={barRef}
                className="absolute inset-y-0 left-0 w-full rounded-full origin-left"
                style={{
                  transform: 'scaleX(0)',
                  background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--accent)))',
                  transition: 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-2.5 px-0.5">
              <span ref={statusRef} className="text-[12px] text-muted-foreground/80 truncate max-w-[70%]">
                Waking up...
              </span>
              <span ref={percentRef} className="text-[12px] tabular-nums text-foreground/80 font-medium">
                0%
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
