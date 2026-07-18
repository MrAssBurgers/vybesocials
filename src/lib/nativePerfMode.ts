import {
  getRuntimeOs,
  isAndroidAppShell,
  isIOSAppShell,
  isNativeAppShell,
  stampRuntimeOsOnDocument,
  type RuntimeOs,
} from '@/lib/despiaBridge';

export type { RuntimeOs };

/** Despia / Capacitor store builds — prioritize smooth scrolling over decorative motion. */
export function isNativePerfMode(): boolean {
  return isNativeAppShell();
}

/** iOS App Store / Despia WKWebView — strict splash fail-open. */
export function isIOSNativeStartup(): boolean {
  return isIOSAppShell();
}

/** Android Play / Despia Chromium WebView. */
export function isAndroidNativeStartup(): boolean {
  return isAndroidAppShell();
}

/**
 * True when Despia/Cap LaunchScreen already covered branding and
 * `#vybe-static-boot` is an invisible #09090b hold (see index.html).
 */
export function isNativeSplashHandoff(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.documentElement.getAttribute('data-vybe-splash') === 'native-handoff') {
    return true;
  }
  return isNativeAppShell();
}

/** Stamp handoff attr if early HTML detect missed (e.g. late Capacitor inject). */
export function ensureNativeSplashHandoffAttr(): void {
  if (typeof document === 'undefined' || !isNativeAppShell()) return;
  const html = document.documentElement;
  if (html.getAttribute('data-vybe-splash') !== 'native-handoff') {
    html.setAttribute('data-vybe-splash', 'native-handoff');
  }
}

/** Brand flash duration by OS (never wait on network). */
export function splashMinMs(): number {
  // Native handoff: no second brand animation — dismiss as soon as gates pass.
  if (isNativeSplashHandoff()) return 0;
  if (isIOSAppShell()) return 180;
  if (isAndroidAppShell()) return 220;
  return 280;
}

/**
 * Absolute splash fail-open. Long enough for persist+auth+critical warm,
 * short enough to never hang cold start (iOS black-screen history).
 */
export function splashAbsoluteMaxMs(): number {
  if (isIOSAppShell()) return 1400;
  if (isAndroidAppShell()) return 1900;
  return 2500;
}

/** Snapchat-style presence heartbeat — 15s online refresh. */
export function presenceHeartbeatMs(): number {
  return 15_000;
}

/** Apply document classes before first paint so CSS can skip heavy effects immediately. */
export function initNativePerfMode(): void {
  if (typeof document === 'undefined') return;
  const os = stampRuntimeOsOnDocument();
  ensureNativeSplashHandoffAttr();
  const html = document.documentElement;

  if (!isNativePerfMode()) return;

  html.classList.remove('vybe-stable-background');
  // Keep clips/feed perf classes; aurora uses static mesh via AppGlobalLiquidShell.
  // Do NOT add reduce-motion here — it kills buttery UI transitions on Despia/Capacitor.
  html.classList.add('native-perf-mode', 'instagram-ready', 'vybe-smooth-native');
  html.setAttribute('data-glass-intensity', 'calm');
  if (os === 'ios') html.classList.add('native-perf-ios');
  if (os === 'android') html.classList.add('native-perf-android');
}

export { getRuntimeOs, stampRuntimeOsOnDocument };
