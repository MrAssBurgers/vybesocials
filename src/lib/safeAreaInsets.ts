import type { DeviceType, PlatformType } from '@/hooks/usePlatform';
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';

export interface MeasuredSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

function parsePaddingPx(style: CSSStyleDeclaration, side: 'Top' | 'Right' | 'Bottom' | 'Left'): number {
  return parseFloat(style[`padding${side}` as keyof CSSStyleDeclaration] as string) || 0;
}

/** Measure env(safe-area-inset-*) — Safari / viewport-fit=cover. */
function measureEnvSafeAreaInsets(): MeasuredSafeAreaInsets {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  const style = getComputedStyle(el);
  const insets = {
    top: parsePaddingPx(style, 'Top'),
    right: parsePaddingPx(style, 'Right'),
    bottom: parsePaddingPx(style, 'Bottom'),
    left: parsePaddingPx(style, 'Left'),
  };
  el.remove();
  return insets;
}

/**
 * Measure Despia runtime vars (`--safe-area-top`, …).
 * Despia injects these before JS runs; env() is often still 0 in the shell.
 */
function measureDespiaSafeAreaInsets(): MeasuredSafeAreaInsets {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const el = document.createElement('div');
  el.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'padding:var(--safe-area-top, 0px) var(--safe-area-right, 0px) var(--safe-area-bottom, 0px) var(--safe-area-left, 0px)',
    'visibility:hidden',
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  const style = getComputedStyle(el);
  const insets = {
    top: parsePaddingPx(style, 'Top'),
    right: parsePaddingPx(style, 'Right'),
    bottom: parsePaddingPx(style, 'Bottom'),
    left: parsePaddingPx(style, 'Left'),
  };
  el.remove();
  return insets;
}

function maxInsets(a: MeasuredSafeAreaInsets, b: MeasuredSafeAreaInsets): MeasuredSafeAreaInsets {
  return {
    top: Math.max(a.top, b.top),
    right: Math.max(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    left: Math.max(a.left, b.left),
  };
}

function fallbackTop(platform: PlatformType, device: DeviceType): number {
  if (device === 'desktop') return 0;
  // Cap Simulator + Despia WKWebView both need Dynamic Island headroom when env() is 0.
  const native = isNativeAppShell();
  if (platform === 'ios') return native ? 59 : 47;
  if (platform === 'android') return native ? 28 : 24;
  return native ? 24 : 20;
}

function fallbackGap(_device: DeviceType): number {
  return 0;
}

function fallbackBottom(platform: PlatformType, device: DeviceType): number {
  if (device === 'desktop') return 0;
  const native = isNativeAppShell();
  if (platform === 'ios') return native ? 34 : 20;
  if (platform === 'android') return native ? 24 : 16;
  return native ? 20 : 12;
}

function fallbackRight(_device: DeviceType): number {
  return 0;
}

function fallbackLeft(_device: DeviceType): number {
  return 0;
}

export function resolveSafeAreaInsets(
  measured: MeasuredSafeAreaInsets,
  platform: PlatformType,
  device: DeviceType,
): MeasuredSafeAreaInsets & { gap: number } {
  const gap = fallbackGap(device);

  // Despia Auto-Inject may already reserve the status bar — don't double-pad
  // when measured insets are present. Cap WKWebView (contentInset:never) still
  // needs fallbacks when env() reports 0 before first layout.
  if (isDespiaRuntime() && (measured.top > 0 || measured.bottom > 0)) {
    return {
      top: measured.top,
      right: measured.right,
      bottom: measured.bottom,
      left: measured.left,
      gap: 0,
    };
  }

  return {
    top: measured.top > 0 ? measured.top : fallbackTop(platform, device),
    right: measured.right > 0 ? measured.right : fallbackRight(device),
    bottom: measured.bottom > 0 ? measured.bottom : fallbackBottom(platform, device),
    left: measured.left > 0 ? measured.left : fallbackLeft(device),
    gap,
  };
}

function contentGutter(insetPx: number): number {
  const baseRem = 16;
  return Math.max(baseRem, insetPx);
}

export function applySafeAreaCssVars(
  platform: PlatformType,
  device: DeviceType,
): () => void {
  if (typeof document === 'undefined') return () => {};

  let lastKey = '';
  let raf = 0;

  const applyNow = () => {
    const fromEnv = measureEnvSafeAreaInsets();
    const fromDespia = isDespiaRuntime()
      ? measureDespiaSafeAreaInsets()
      : { top: 0, right: 0, bottom: 0, left: 0 };
    const measured = maxInsets(fromEnv, fromDespia);
    const resolved = resolveSafeAreaInsets(measured, platform, device);
    // Skip no-op writes — visualViewport resize (keyboard / rubber-band) used to
    // thrash --sat/--sab every frame and make whole screens jump on iOS.
    const key = `${resolved.top}|${resolved.right}|${resolved.bottom}|${resolved.left}|${resolved.gap}`;
    if (key === lastKey) return;
    lastKey = key;

    const root = document.documentElement;
    const body = document.body;

    root.style.setProperty('--app-header-safe', `${resolved.top}px`);
    root.style.setProperty('--app-header-gap', `${resolved.gap}px`);
    root.style.setProperty('--app-header-safe-right', `${resolved.right}px`);
    root.style.setProperty('--sat', `${resolved.top}px`);
    root.style.setProperty('--sar', `${resolved.right}px`);
    root.style.setProperty('--sab', `${resolved.bottom}px`);
    root.style.setProperty('--sal', `${resolved.left}px`);
    root.style.setProperty('--app-gutter-x', `${contentGutter(resolved.left)}px`);
    root.style.setProperty('--app-gutter-x-end', `${contentGutter(resolved.right)}px`);
    body.style.setProperty('--sat', `${resolved.top}px`);
    body.style.setProperty('--sar', `${resolved.right}px`);
    body.style.setProperty('--sab', `${resolved.bottom}px`);
    body.style.setProperty('--sal', `${resolved.left}px`);
    // Kill Despia Auto-Inject body padding if left on — we own insets in chrome.
    body.style.paddingTop = '0px';
    body.style.paddingBottom = '0px';
    // Cap + Despia both need [data-native-shell] for iOS shell CSS (safe area / fill).
    if (isNativeAppShell()) {
      root.setAttribute('data-native-shell', 'true');
    } else {
      root.removeAttribute('data-native-shell');
    }
  };

  const scheduleApply = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      applyNow();
    });
  };

  applyNow();
  window.addEventListener('resize', scheduleApply);
  window.addEventListener('orientationchange', scheduleApply);
  // Do NOT listen to visualViewport — keyboard open/close and iOS rubber-band
  // fire continuous resizes while env(safe-area-*) stays the same.

  return () => {
    if (raf) window.cancelAnimationFrame(raf);
    window.removeEventListener('resize', scheduleApply);
    window.removeEventListener('orientationchange', scheduleApply);
  };
}
