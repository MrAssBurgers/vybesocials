import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { clearAppUpdateFlag } from '@/lib/appUpdateBridge';

const STATUS_LINES = [
  'Downloading latest version…',
  'Applying improvements…',
  'Polishing the experience…',
  'Almost ready…',
];

function lockUpdateShell() {
  document.documentElement.classList.add('app-update-visible');
  document.body.classList.add('app-update-visible');
  document.body.style.overflow = 'hidden';
}

function unlockUpdateShell() {
  document.documentElement.classList.remove('app-update-visible');
  document.body.classList.remove('app-update-visible');
  document.body.style.overflow = '';
}

export const AppUpdateOverlay = memo(function AppUpdateOverlay() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const activeRef = useRef(false);

  useEffect(() => {
    clearAppUpdateFlag();
    const begin = () => {
      if (activeRef.current) return;
      activeRef.current = true;
      lockUpdateShell();
      setIsUpdating(true);
      setStatusIndex(0);
    };

    const handleVybeUpdate = () => begin();
    // The very first SW install also fires `controllerchange` (via clients.claim
    // in public/sw.js). Treating that as an update leaves brand-new visitors
    // stuck on the "Updating VYBE" overlay forever, because serviceWorker.ts
    // only schedules a reload when a prior controller existed. Only treat this
    // event as an update when a controller was already active at mount.
    const hadControllerAtMount = Boolean(navigator.serviceWorker?.controller);
    const handleSWUpdate = () => {
      if (!hadControllerAtMount) return;
      begin();
    };

    window.addEventListener('vybe-app-update', handleVybeUpdate);
    navigator.serviceWorker?.addEventListener('controllerchange', handleSWUpdate);

    if (import.meta.hot) {
      import.meta.hot.on('vite:beforeFullReload', begin);
    }

    return () => {
      window.removeEventListener('vybe-app-update', handleVybeUpdate);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleSWUpdate);
      if (!activeRef.current) unlockUpdateShell();
    };
  }, []);

  useEffect(() => {
    if (!isUpdating) return;
    lockUpdateShell();
    const interval = window.setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_LINES.length);
    }, 2200);
    return () => window.clearInterval(interval);
  }, [isUpdating]);

  // Never auto-dismiss — stay fullscreen until the page unloads.
  useEffect(() => {
    if (!isUpdating) return;
    return () => unlockUpdateShell();
  }, [isUpdating]);

  if (!isUpdating || typeof document === 'undefined') return null;

  const reduceMotion = isNativePerfMode();

  return createPortal(
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="Updating VYBE"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0.08 : 0.22, ease: [0.16, 1, 0.3, 1] }}
      className="vybe-app-update-overlay fixed inset-0 flex flex-col items-center justify-center overflow-hidden overscroll-none"
      style={{
        zIndex: 2147483646,
        minHeight: '100dvh',
        height: '100dvh',
        width: '100vw',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'max(env(safe-area-inset-left, 0px), 1rem)',
        paddingRight: 'max(env(safe-area-inset-right, 0px), 1rem)',
        boxSizing: 'border-box',
        background: 'hsl(var(--background))',
        touchAction: 'none',
      }}
    >
      {/* Ambient mesh — matches boot splash so the transition feels seamless */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0 vybe-boot-mesh"
          style={{
            background:
              'radial-gradient(ellipse 95% 75% at 18% 22%, hsl(var(--primary) / 0.42), transparent 58%),' +
              'radial-gradient(ellipse 85% 65% at 82% 78%, hsl(var(--accent) / 0.32), transparent 55%),' +
              'linear-gradient(145deg, hsl(var(--background)) 0%, hsl(var(--card, var(--background)) / 0.9) 45%, hsl(var(--background)) 100%)',
          }}
        />
        {!reduceMotion && (
          <>
            <div
              className="absolute rounded-full opacity-40 blur-[72px]"
              style={{
                top: '14%',
                left: '16%',
                width: 'min(360px, 55vw)',
                height: 'min(360px, 55vw)',
                background: 'hsl(var(--primary) / 0.45)',
                transform: 'translate(-50%, -50%)',
              }}
            />
            <div
              className="absolute rounded-full opacity-35 blur-[72px]"
              style={{
                top: '72%',
                left: '78%',
                width: 'min(400px, 60vw)',
                height: 'min(400px, 60vw)',
                background: 'hsl(var(--accent) / 0.38)',
                transform: 'translate(-50%, -50%)',
              }}
            />
          </>
        )}
      </div>

      <div className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm">
        <motion.div
          animate={reduceMotion ? undefined : { scale: [1, 1.05, 1] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="w-[5.5rem] h-[5.5rem] rounded-[1.4rem] bg-primary flex items-center justify-center shadow-2xl shadow-primary/25">
            <span className="text-[2rem] font-black text-primary-foreground tracking-tighter select-none">V</span>
          </div>
        </motion.div>

        <div className="text-center space-y-2 px-2">
          <h2 className="text-2xl font-bold text-foreground tracking-tight">Updating VYBE</h2>
          <p className="text-sm text-muted-foreground min-h-[1.25rem] transition-opacity duration-300">
            {STATUS_LINES[statusIndex]}
          </p>
        </div>

        <div className="w-full max-w-[13rem] space-y-2.5">
          <div className="h-1.5 rounded-full bg-muted/80 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary origin-left"
              initial={{ scaleX: 0.08 }}
              animate={{ scaleX: reduceMotion ? 0.65 : [0.08, 0.55, 0.72, 0.88, 0.72, 0.88] }}
              transition={
                reduceMotion
                  ? { duration: 0.3 }
                  : { duration: 4.5, repeat: Infinity, ease: 'easeInOut' }
              }
              style={{ width: '100%' }}
            />
          </div>
          <p className="text-[11px] text-center text-muted-foreground flex items-center justify-center gap-1.5">
            <Sparkles className="w-3 h-3 shrink-0 opacity-70" />
            <span>Just a moment — we&apos;ll be right back</span>
          </p>
        </div>
      </div>
    </motion.div>,
    document.body,
  );
});
