/** Shared signal so SW reload, version bump, and overlay stay in sync. */
export function hasActiveAppDraft(): boolean {
  if (typeof document === 'undefined') return false;
  const bootGuard = (window as unknown as { __VYBE_HAS_BOOT_DRAFT__?: () => boolean }).__VYBE_HAS_BOOT_DRAFT__;
  if (bootGuard?.()) return true;
  if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return true;
  return Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLElement>('input, textarea, [contenteditable="true"]')).some(field => {
    if (field instanceof HTMLInputElement && /^(checkbox|radio|range|button|submit|hidden)$/i.test(field.type)) return false;
    return ('value' in field && Boolean(field.value)) || (field.getAttribute('contenteditable') === 'true' && Boolean(field.textContent));
  });
}

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
