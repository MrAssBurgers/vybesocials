import { memo, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VYBELogo } from '@/components/ui/VYBELogo';
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
        <VYBELogo size="xl" showText={false} animated />
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
export const VybePageLoader = memo(function VybePageLoader({ delay = 1400 }: { delay?: number }) {
  const [show, setShow] = useState(delay === 0);
  const [splashVisible, setSplashVisible] = useState(() =>
    typeof document !== 'undefined' && document.body.classList.contains('splash-visible'),
  );

  useEffect(() => {
    if (delay === 0) return;
    const t = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  useEffect(() => {
    const sync = () => setSplashVisible(document.body.classList.contains('splash-visible'));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  if (splashVisible) return null;

  if (!show) {
    return (
      <div
        className="page-shell vybe-loading-shell min-h-[100dvh] w-full"
        aria-hidden="true"
      />
    );
  }

  return (
    <div
      className="page-shell vybe-loading-shell min-h-[100dvh] w-full flex items-center justify-center"
      data-vybe-boot-screen
    >
      <LoaderContents />
    </div>
  );
});
