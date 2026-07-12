/** Shared signal so SW reload, version bump, and overlay stay in sync. */
export function signalAppUpdate(): void {
  try {
    sessionStorage.setItem('vybe-app-updating', '1');
    window.dispatchEvent(new CustomEvent('vybe-app-update'));
  } catch {
    /* cosmetic */
  }
}

export function isAppUpdateInProgress(): boolean {
  try {
    return sessionStorage.getItem('vybe-app-updating') === '1';
  } catch {
    return false;
  }
}

export function clearAppUpdateFlag(): void {
  try {
    sessionStorage.removeItem('vybe-app-updating');
  } catch {
    /* ignore */
  }
}

/** Minimum time for the fullscreen overlay to paint before navigation. */
export const APP_UPDATE_RELOAD_DELAY_MS = 1500;
