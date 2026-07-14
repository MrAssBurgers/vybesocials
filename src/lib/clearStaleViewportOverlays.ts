/**
 * Clears leftover full-viewport overlays that stay mounted after sheets/drawers/dialogs
 * close (opacity 0 / aria-hidden) but still capture clicks across the desktop shell.
 */
export function clearStaleViewportOverlays(): void {
  if (typeof document === 'undefined') return;

  // Chat screenshot curtain must never eat taps.
  const curtain = document.getElementById('vybe-chat-shield-curtain');
  if (curtain instanceof HTMLElement) {
    curtain.style.pointerEvents = 'none';
    if (document.documentElement.getAttribute('data-chat-shield') !== 'blocking') {
      curtain.style.display = 'none';
    }
  }

  // Clear camera chrome freeze if overlay is gone.
  const cameraPortal = document.querySelector('[data-camera-overlay], .camera-overlay-root');
  if (!cameraPortal && document.documentElement.getAttribute('data-camera-open') === 'true') {
    document.documentElement.removeAttribute('data-camera-open');
    if (document.body.style.overflow === 'hidden') {
      document.body.style.overflow = '';
    }
  }

  document.querySelectorAll<HTMLElement>('body > *').forEach((el) => {
    if (el.id === 'root' || el.id === 'app-shell' || el.hasAttribute('data-app-shell')) return;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') return;
    // Never touch live call UI / bottom nav.
    if (el.classList.contains('vybe-incoming-call-overlay')) return;
    if (el.getAttribute('aria-label') === 'Bottom navigation') return;

    const style = getComputedStyle(el);
    if (style.position !== 'fixed') return;

    const coversViewport =
      style.inset === '0px' ||
      (style.top === '0px' &&
        style.right === '0px' &&
        style.bottom === '0px' &&
        style.left === '0px') ||
      (el.offsetWidth >= window.innerWidth - 2 && el.offsetHeight >= window.innerHeight - 2);

    if (!coversViewport) return;

    const hidden =
      el.getAttribute('aria-hidden') === 'true' ||
      el.getAttribute('data-state') === 'closed' ||
      style.opacity === '0' ||
      style.visibility === 'hidden' ||
      style.display === 'none';

    if (hidden && style.pointerEvents !== 'none') {
      el.style.pointerEvents = 'none';
    }
  });
}
