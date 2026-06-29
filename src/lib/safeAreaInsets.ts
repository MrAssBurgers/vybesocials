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

  const apply = () => {
    const measured = measureEnvSafeAreaInsets();
    const resolved = resolveSafeAreaInsets(measured, platform, device);
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

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
  window.visualViewport?.addEventListener('resize', apply);

  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', apply);
    window.visualViewport?.removeEventListener('resize', apply);
  };
}
