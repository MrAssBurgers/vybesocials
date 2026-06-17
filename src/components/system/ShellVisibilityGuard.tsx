import { useEffect } from 'react';
import { ensureAppShellVisible } from '@/lib/attResumeRecovery';
import { markBootComplete, showBootRecovery } from '@/lib/bootGuard';

function rootHasMeaningfulContent(): boolean {
  if (typeof window.__VYBE_HAS_MEANINGFUL_CONTENT__ === 'function') {
    return window.__VYBE_HAS_MEANINGFUL_CONTENT__();
  }
  const root = document.getElementById('root');
  if (!root) return false;
  const text = (root.textContent || '').replace(/\s+/g, '');
  return text.length > 40;
}

/**
 * React-side blank shell recovery — complements public/boot-guard.js.
 * Clears stuck WebView locks and surfaces recovery if the shell is empty.
 */
export function ShellVisibilityGuard() {
  useEffect(() => {
    let streak = 0;

    const tick = () => {
      if (document.visibilityState === 'hidden') return;

      ensureAppShellVisible();

      if (document.body.classList.contains('splash-visible')) {
        streak = 0;
        return;
      }

      if (rootHasMeaningfulContent()) {
        streak = 0;
        markBootComplete();
        return;
      }

      streak += 1;
      if (streak >= 4) {
        document.body.classList.remove('vybe-incoming-call-active');
        ensureAppShellVisible();
        showBootRecovery('blank_shell');
      }
    };

    const interval = window.setInterval(tick, 1000);
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(tick);
    });

    return () => {
      window.clearInterval(interval);
      cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
