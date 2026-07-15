import type { DeviceType, PlatformType } from '@/hooks/usePlatform';
import { isDespiaRuntime } from '@/lib/despiaBridge';

export interface MeasuredSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

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
    top: parseFloat(style.paddingTop) || 0,
    right: parseFloat(style.paddingRight) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
  };
  el.remove();
  return insets;
}

function fallbackTop(platform: PlatformType, device: DeviceType): number {
  if (device === 'desktop') return 0;
  const native = isDespiaRuntime();
  if (platform === 'ios') return native ? 59 : 47;
  if (platform === 'android') return native ? 28 : 24;
  return native ? 24 : 20;
}

function fallbackGap(_device: DeviceType): number {
  return 0;
}

function fallbackBottom(platform: PlatformType, device: DeviceType): number {
  if (device === 'desktop') return 0;
  const native = isDespiaRuntime();
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

  // Despia/Capacitor WebViews are already edge-to-edge with viewport-fit=cover.
  // Inflating missing env() with hard-coded notch padding double-letterboxes the UI.
  if (isDespiaRuntime()) {
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
    const measured = measureEnvSafeAreaInsets();
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
    if (isDespiaRuntime()) {
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
