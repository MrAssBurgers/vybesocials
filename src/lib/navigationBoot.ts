/**
 * Navigation-type helpers for splash / paint guards (refresh, bfcache, native WebView).
 */

import { SPLASH_DONE_KEY } from '@/lib/splashSession';

export type NavigationEntryType = 'navigate' | 'reload' | 'back_forward' | 'prerender';

export function getNavigationType(): NavigationEntryType | null {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    return (nav?.type as NavigationEntryType) ?? null;
  } catch {
    return null;
  }
}

/** Full page refresh — splash should run again so users never see an empty shell. */
export function isHardReload(): boolean {
  return getNavigationType() === 'reload';
}

/** bfcache restore (iOS Safari / some Android WebViews). */
export function isBfcacheRestore(event?: PageTransitionEvent): boolean {
  if (event?.persisted) return true;
  return getNavigationType() === 'back_forward';
}

/**
 * Clears splash-completed flag on hard reload so App shows SplashScreen again.
 * Call once at App module init before reading splash state.
 */
export function resetSplashSessionOnHardReload(): void {
  if (!isHardReload()) return;
  try {
    sessionStorage.removeItem(SPLASH_DONE_KEY);
  } catch {
    /* ignore */
  }
}

/** True when #app-shell has a route or auth surface painted (not an empty transparent shell). */
export function hasAppShellPaint(): boolean {
  const shell = document.getElementById('app-shell');
  if (!shell) return false;
  return !!shell.querySelector(
    '[data-route-shell], #main-content, [data-auth-shell], main, nav[aria-label]',
  );
}

export function waitForAppShellPaint(timeoutMs = 3200): Promise<void> {
  if (hasAppShellPaint()) return Promise.resolve();

  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      if (hasAppShellPaint() || Date.now() - started >= timeoutMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
