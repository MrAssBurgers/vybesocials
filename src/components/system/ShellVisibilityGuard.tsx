import { useEffect } from 'react';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';

/**
 * Clears stuck WebView scroll/visibility locks after boot.
 * Does NOT show recovery UI — that caused false positives during route transitions.
 */
export function ShellVisibilityGuard() {
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      ensureAppShellVisible();
    };

    tick();
    const interval = window.setInterval(tick, 3000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
