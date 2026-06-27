import { isNativeAppShell } from '@/lib/despiaBridge';

/** Despia / Capacitor store builds — prioritize smooth scrolling over decorative motion. */
export function isNativePerfMode(): boolean {
  return isNativeAppShell();
}

/** Snapchat-style presence heartbeat — 15s online refresh. */
export function presenceHeartbeatMs(): number {
  return 15_000;
}

/** Apply document classes before first paint so CSS can skip heavy effects immediately. */
export function initNativePerfMode(): void {
  if (typeof document === 'undefined' || !isNativePerfMode()) return;
  const html = document.documentElement;
  html.classList.remove('vybe-stable-background');
  // Keep clips/feed perf classes; aurora uses static mesh via AppGlobalLiquidShell.
  // Do NOT add reduce-motion here — it kills buttery UI transitions on Despia/Capacitor.
  html.classList.add('native-perf-mode', 'instagram-ready', 'vybe-smooth-native');
  html.setAttribute('data-glass-intensity', 'calm');
}
