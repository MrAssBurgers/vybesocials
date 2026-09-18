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

export function isAndroidTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (!/Android/i.test(navigator.userAgent || '')) return false;
  return navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
}

/**
 * Galaxy Z Fold / Flip and similar — model codes or Fold token in UA.
 * Unfolded inner displays often report ≥1024 CSS px and would otherwise get desktop sidebars.
 */
export function isSamsungFoldableUa(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /SM-F\d{3}|SM-W\d{3}|SM-E\d{3}|Fold/i.test(ua);
}

/**
 * Prefer phone/tablet app shell (bottom nav, no desktop sidebars).
 * Mirrors iPad special-casing for Android Fold inner screens and Despia Android.
 */
export function preferTouchAppShell(): boolean {
  if (detectIsIPad()) return true;
  if (isSamsungFoldableUa()) return true;
  if (typeof navigator === 'undefined') return false;
  // Android store / Despia shell: never desktop layout (Fold 8 inner ≥1024 CSS px).
  if (isNativeAppShell() && /Android/i.test(navigator.userAgent || '')) return true;
  if (!isAndroidTouchDevice()) return false;
  try {
    const fineDesktop = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    // Coarse touch (phones/folds) → touch shell; hover+fine without coarse → desktop Chrome.
    return coarse || !fineDesktop;
  } catch {
    return true;
  }
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
  if (preferTouchAppShell()) return true;
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
