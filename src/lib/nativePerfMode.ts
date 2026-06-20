import { isNativeAppShell } from '@/lib/despiaBridge';

/** Despia / Capacitor store builds — prioritize smooth scrolling over decorative motion. */
export function isNativePerfMode(): boolean {
  return isNativeAppShell();
}

/** Less frequent presence pings on native — saves battery and DB writes. */
export function presenceHeartbeatMs(): number {
  return isNativeAppShell() ? 45_000 : 30_000;
}

/** Apply document classes before first paint so CSS can skip heavy effects immediately. */
export function initNativePerfMode(): void {
  if (typeof document === 'undefined' || !isNativePerfMode()) return;
  const html = document.documentElement;
  html.classList.remove('vybe-stable-background');
  // Keep clips/feed perf classes; aurora uses static mesh via AppGlobalLiquidShell.
  html.classList.add('native-perf-mode', 'instagram-ready', 'reduce-motion');
  html.setAttribute('data-glass-intensity', 'calm');
}
