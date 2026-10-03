import { useState, useEffect, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { clearAppUpdateFlag, isAppUpdateInProgress } from '@/lib/appUpdateBridge';
import { Button } from '@/components/ui/button';

const STATUS_LINES = [
  'Applying update…',
  'Almost ready…',
];

const RECOVERY_AFTER_MS = 6_000;
const AUTO_DISMISS_MATCH_MS = 1_200;
const RELOAD_ONCE_KEY = 'vybe-update-reload-once';

function runningEntryPath(): string | null {
  if (typeof document === 'undefined') return null;
  const scripts = Array.from(document.querySelectorAll('script[type="module"][src]'));
  for (const el of scripts) {
    const src = el.getAttribute('src') || '';
    if (/\/assets\/app-[^/]+\.js(?:\?|$)/i.test(src)) {
      try {
        return new URL(src, window.location.origin).pathname;
      } catch {
        return src.split('?')[0];
      }
    }
  }
  return null;
}

async function remoteEntryPath(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { entry?: string | null };
    return data.entry || null;
  } catch {
    return null;
  }
}

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

async function clearAppCachesAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    /* best effort */
  }
  sessionStorage.removeItem(RELOAD_ONCE_KEY);
  clearAppUpdateFlag();
  window.location.replace(`/?_vybe=${Date.now()}`);
}

export const AppUpdateOverlay = memo(function AppUpdateOverlay() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const activeRef = useRef(false);

  const dismiss = () => {
    activeRef.current = false;
    setIsUpdating(false);
    setShowRecovery(false);
    clearAppUpdateFlag();
    unlockUpdateShell();
    sessionStorage.removeItem(RELOAD_ONCE_KEY);
  };

  useEffect(() => {
    // Vite owns development refreshes. A dirty editor can cancel an HMR reload;
    // showing the production update wall then traps the still-running preview.
    if (import.meta.env.DEV) {
      clearAppUpdateFlag();
      unlockUpdateShell();
      return;
    }
    // If we just finished a controlled reload onto the current entry, stay usable.
    if (sessionStorage.getItem(RELOAD_ONCE_KEY) === '1' && !isAppUpdateInProgress()) {
      sessionStorage.removeItem(RELOAD_ONCE_KEY);
    }
    clearAppUpdateFlag();

    let cancelled = false;
    void (async () => {
      const remote = await remoteEntryPath();
      const local = runningEntryPath();
      if (cancelled) return;
      // Already on the published entry — never trap the user behind an update wall.
      if (remote && local && remote === local) {
        dismiss();
      }
    })();

    const begin = () => {
      if (activeRef.current) return;
      activeRef.current = true;
      lockUpdateShell();
      setIsUpdating(true);
      setShowRecovery(false);
      setStatusIndex(0);
    };

    const handleVybeUpdate = () => begin();
    const hadControllerAtMount = Boolean(navigator.serviceWorker?.controller);
    const handleSWUpdate = () => {
      if (!hadControllerAtMount) return;
      begin();
    };

    const handleTombstone = (event: MessageEvent) => {
      if (event.data?.type !== 'VYBE_LEGACY_SW_TOMBSTONE') return;
      begin();
      window.setTimeout(() => {
        window.location.replace(`/?_vybe_migrate=${Date.now()}`);
      }, 400);
    };

    window.addEventListener('vybe-app-update', handleVybeUpdate);
    navigator.serviceWorker?.addEventListener('controllerchange', handleSWUpdate);
    navigator.serviceWorker?.addEventListener('message', handleTombstone);

    return () => {
      cancelled = true;
      window.removeEventListener('vybe-app-update', handleVybeUpdate);
      navigator.serviceWorker?.removeEventListener('controllerchange', handleSWUpdate);
      navigator.serviceWorker?.removeEventListener('message', handleTombstone);
      if (!activeRef.current) unlockUpdateShell();
    };
  }, []);

  useEffect(() => {
    if (!isUpdating) return;
    lockUpdateShell();
    const interval = window.setInterval(() => {
      setStatusIndex((i) => (i + 1) % STATUS_LINES.length);
    }, 2200);

    // If the running entry already matches production, auto-dismiss quickly.
    const matchTimer = window.setTimeout(() => {
      void (async () => {
        const remote = await remoteEntryPath();
        const local = runningEntryPath();
        if (remote && local && remote === local) {
          dismiss();
        }
      })();
    }, AUTO_DISMISS_MATCH_MS);

    const recoveryTimer = window.setTimeout(() => setShowRecovery(true), RECOVERY_AFTER_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(matchTimer);
      window.clearTimeout(recoveryTimer);
    };
  }, [isUpdating]);

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
      aria-busy={!showRecovery}
      aria-label={showRecovery ? 'Update needs attention' : 'Applying app update'}
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
          <h2 className="text-2xl font-bold text-foreground tracking-tight">
            {showRecovery ? 'Still updating' : 'App updated'}
          </h2>
          <p className="text-sm text-muted-foreground min-h-[1.25rem]">
            {showRecovery
              ? 'Reload once more, or clear the app cache if this screen returns.'
              : 'Refreshing to the latest version…'}
          </p>
        </div>

        {!showRecovery ? (
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
              <span>{STATUS_LINES[statusIndex]}</span>
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full max-w-xs">
            <Button
              className="rounded-full"
              onClick={() => {
                sessionStorage.setItem(RELOAD_ONCE_KEY, '1');
                clearAppUpdateFlag();
                window.location.replace(`/?_vybe=${Date.now()}`);
              }}
            >
              Retry
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => void clearAppCachesAndReload()}>
              Clear app cache
            </Button>
            <Button variant="ghost" className="rounded-full text-muted-foreground" onClick={dismiss}>
              Continue anyway
            </Button>
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
});
