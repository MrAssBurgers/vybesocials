/**
 * Sync device heuristics for routing and native-shell detection.
 * Keep in sync with `use-mobile.tsx` breakpoints where possible.
 */

const TABLET_BREAKPOINT = 1024;

/** Modern iPads often report as Macintosh with touch. */
export function detectIsIPad(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /ipad/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isAppleTouchDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * True for phones, tablets, and iPad (any orientation).
 * Used at `/` so store builds never land on the desktop marketing page.
 */
export function isMobileOrTabletDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (detectIsIPad()) return true;
  return window.innerWidth < TABLET_BREAKPOINT;
}

/**
 * Likely embedded iOS WebView (Despia / Capacitor / in-app browser shell).
 * Catches iPadOS desktop UA where `iPad` is absent from userAgent.
 */
export function isEmbeddedAppleWebView(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (!isAppleTouchDevice()) return false;

  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;

  if (isStandaloneApp()) return true;

  if (/AppleWebKit/i.test(ua)) {
    const afterWebKit = ua.split('AppleWebKit')[1] || '';
    // WKWebView often lacks a Safari token in the WebKit segment.
    if (!/Safari/i.test(afterWebKit)) return true;
  }

  // Coarse pointer + touch → tablet/phone shell, not desktop Safari.
  const coarseTouch =
    window.matchMedia?.('(pointer: coarse)').matches === true && navigator.maxTouchPoints > 0;
  if (coarseTouch && !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches) {
    return true;
  }

  return false;
}
