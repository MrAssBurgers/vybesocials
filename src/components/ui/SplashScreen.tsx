import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VybeWordmark } from '@/components/ui/VybeWordmark';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { SplashAmbientBubbles } from '@/components/effects/SplashAmbientBubbles';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { subscribeSplashProgress } from '@/lib/splashProgressBridge';
import { clearSplashDocumentLocks } from '@/lib/splashDismiss';

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
    clearSplashDocumentLocks();
  }, [isVisible]);

  return (
    <AnimatePresence
      onExitComplete={() => {
        ensureAppShellVisible();
        clearSplashDocumentLocks();
      }}
    >
      {isVisible && (
        <motion.div
          key="vybe-splash"
          id="vybe-react-splash"
          data-vybe-splash-overlay
          data-vybe-boot-screen
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: 'easeOut' }}
          className="fixed inset-0 flex flex-col items-center justify-center overflow-x-hidden overflow-y-visible vybe-splash-overlay"
          style={{
            zIndex: 2147483647,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!reduceMotion && <SplashAmbientBubbles />}

          <div className="relative z-10 flex flex-col items-center justify-center overflow-visible">
            <div className="mb-5">
              <VYBELogo size="splash" showText={false} animated={!reduceMotion} />
            </div>

            <VybeWordmark size="splash" as="h1" className="mb-5 overflow-visible" />

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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
