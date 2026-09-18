import { useEffect } from 'react';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';

/**
 * Clears stuck WebView scroll/visibility locks after boot.
 * Does NOT show recovery UI — that caused false positives during route transitions.
 * Also re-runs on fold/unfold resize (Galaxy Fold cover ↔ inner).
 */
export function ShellVisibilityGuard() {
  useEffect(() => {
    const tick = () => {
      // Always clear stuck splash/root locks — iOS can boot with visibility=hidden.
      // [Android-only] Fold hinge / multi-window also needs this after resize.
      ensureAppShellVisible();
    };

    tick();
    const interval = window.setInterval(tick, 3000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('resize', tick);
    window.addEventListener('orientationchange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('resize', tick);
      window.removeEventListener('orientationchange', tick);
    };
  }, []);

  return null;
}
