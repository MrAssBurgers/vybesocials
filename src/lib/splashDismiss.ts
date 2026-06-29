import { ensureAppShellVisible } from '@/lib/attResumeRecovery';
import { hideStaticBootSplash, publishSplashProgress } from '@/lib/splashProgressBridge';

const APP_READY_ATTR = 'data-vybe-app-ready';

/**
 * Clear pre-React static boot + document scroll locks.
 * Never remove React-managed splash nodes — that races AnimatePresence and throws removeChild.
 */
export function clearSplashDocumentLocks(): void {
  publishSplashProgress(100, "Let's go! ✨");
  hideStaticBootSplash();
  document.body.classList.remove('splash-visible');
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  ensureAppShellVisible();
}

/** @deprecated Use clearSplashDocumentLocks — kept for call-site compatibility. */
export function teardownAllSplashLayers(): void {
  clearSplashDocumentLocks();
}

export function markAppReady(): void {
  document.documentElement.setAttribute(APP_READY_ATTR, 'true');
}
