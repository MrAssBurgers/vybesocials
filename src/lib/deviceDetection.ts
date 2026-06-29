/**
 * Sync device heuristics for routing and native-shell detection.
 * Keep in sync with `use-mobile.tsx` breakpoints where possible.
 */

import { isNativeAppShell } from '@/lib/despiaBridge';

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

/** Safari browser on iPhone/iPad (not an embedded in-app WebView). */
export function isMobileSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (!isAppleTouchDevice()) return false;
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\//.test(ua)) return false;
  return /Safari\//i.test(ua) && /Version\//i.test(ua);
}

/** Desktop browser — popup OAuth; never full-page redirect. */
export function isDesktopWebBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  return !isNativeAppShell() && !isMobileOrTabletDevice();
}

/**
 * Likely embedded iOS WebView (Despia / Capacitor / in-app browser shell).
 * Catches iPadOS desktop UA where `iPad` is absent from userAgent.
 */
export function isEmbeddedAppleWebView(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false;
  if (!isAppleTouchDevice()) return false;
  if (isMobileSafariBrowser()) return false;

  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;

  if (isStandaloneApp()) return true;

  if (/AppleWebKit/i.test(ua)) {
    const afterWebKit = ua.split('AppleWebKit')[1] || '';
    // WKWebView often lacks a Safari token in the WebKit segment.
    if (!/Safari/i.test(afterWebKit)) return true;
  }

  return false;
}
