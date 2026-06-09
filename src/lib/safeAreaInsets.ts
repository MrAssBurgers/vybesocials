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
  if (isDespiaRuntime()) {
    if (platform === 'ios') return 48;
    if (platform === 'android') return 40;
    return 36;
  }
  if (platform === 'ios') return 47;
  if (platform === 'android') return 32;
  return 28;
}

function fallbackRight(device: DeviceType): number {
  if (device === 'desktop') return 0;
  return isDespiaRuntime() ? 14 : 10;
}

export function resolveSafeAreaInsets(
  measured: MeasuredSafeAreaInsets,
  platform: PlatformType,
  device: DeviceType,
): MeasuredSafeAreaInsets {
  const topFloor = fallbackTop(platform, device);
  const rightFloor = fallbackRight(device);
  return {
    top: Math.max(measured.top, topFloor),
    right: Math.max(measured.right, rightFloor),
    bottom: Math.max(measured.bottom, device === 'desktop' ? 0 : 0),
    left: Math.max(measured.left, 0),
  };
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
    root.style.setProperty('--app-header-safe-right', `${resolved.right}px`);
    body.style.setProperty('--sat', `${resolved.top}px`);
    body.style.setProperty('--sar', `${resolved.right}px`);
    body.style.setProperty('--sab', `${resolved.bottom}px`);
    body.style.setProperty('--sal', `${resolved.left}px`);
  };

  apply();
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('scroll', apply);

  return () => {
    window.removeEventListener('resize', apply);
    window.visualViewport?.removeEventListener('resize', apply);
    window.visualViewport?.removeEventListener('scroll', apply);
  };
}
