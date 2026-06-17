/**
 * Signals successful React boot to the pre-React watchdog (public/boot-guard.js).
 */

declare global {
  interface Window {
    __VYBE_MARK_BOOT_COMPLETE__?: () => void;
    __VYBE_SHOW_BOOT_RECOVERY__?: (reason?: string) => void;
    __VYBE_CLEAR_CACHE_RELOAD__?: () => void;
    __VYBE_HAS_MEANINGFUL_CONTENT__?: () => boolean;
  }
}

export function markBootComplete(): void {
  try {
    window.__VYBE_MARK_BOOT_COMPLETE__?.();
  } catch {
    document.documentElement.setAttribute('data-vybe-boot', 'ready');
  }
}

export function showBootRecovery(reason?: string): void {
  try {
    window.__VYBE_SHOW_BOOT_RECOVERY__?.(reason);
  } catch {
    /* inline guard handles DOM */
  }
}

export function clearCacheAndReload(): void {
  if (typeof window.__VYBE_CLEAR_CACHE_RELOAD__ === 'function') {
    window.__VYBE_CLEAR_CACHE_RELOAD__();
    return;
  }
  window.location.reload();
}
