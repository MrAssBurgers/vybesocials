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

function readVisualViewportTop(): number {
  if (typeof window === 'undefined') return 0;
  return window.visualViewport?.offsetTop ?? 0;
}

function fallbackTop(platform: PlatformType, device: DeviceType): number {
  if (device === 'desktop') return 0;

  const native = isDespiaRuntime();
  if (platform === 'ios') return native ? 59 : 52;
  if (platform === 'android') return native ? 52 : 44;
  return native ? 44 : 36;
}

function fallbackGap(device: DeviceType): number {
  if (device === 'desktop') return 0;
  return isDespiaRuntime() ? 12 : 8;
}

function fallbackRight(device: DeviceType): number {
  if (device === 'desktop') return 0;
  return isDespiaRuntime() ? 16 : 12;
}

export function resolveSafeAreaInsets(
  measured: MeasuredSafeAreaInsets,
  platform: PlatformType,
  device: DeviceType,
): MeasuredSafeAreaInsets & { gap: number } {
  const topFloor = fallbackTop(platform, device);
  const viewportTop = readVisualViewportTop();
  const rightFloor = fallbackRight(device);
  const gap = fallbackGap(device);

  return {
    top: Math.max(measured.top, topFloor, viewportTop),
    right: Math.max(measured.right, rightFloor),
    bottom: Math.max(measured.bottom, 0),
    left: Math.max(measured.left, 0),
    gap,
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
    root.style.setProperty('--app-header-gap', `${resolved.gap}px`);
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
