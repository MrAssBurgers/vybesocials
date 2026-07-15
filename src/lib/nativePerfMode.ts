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

/** Brand flash duration by OS (never wait on network). */
export function splashMinMs(): number {
  if (isIOSAppShell()) return 180;
  if (isAndroidAppShell()) return 220;
  return 280;
}

/**
 * Absolute splash fail-open. iOS is strictest (black-screen history);
 * Android can wait a beat longer; web is most lenient.
 */
export function splashAbsoluteMaxMs(): number {
  if (isIOSAppShell()) return 900;
  if (isAndroidAppShell()) return 1500;
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
