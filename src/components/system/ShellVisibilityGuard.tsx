import { useEffect } from 'react';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';

/**
 * Clears stuck WebView scroll/visibility locks after boot.
 * Does NOT show recovery UI — that caused false positives during route transitions.
 */
export function ShellVisibilityGuard() {
  useEffect(() => {
    const tick = () => {
      // Always clear stuck splash/root locks — iOS can boot with visibility=hidden.
      ensureAppShellVisible();
    };

    tick();
    const interval = window.setInterval(tick, 3000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return null;
}
