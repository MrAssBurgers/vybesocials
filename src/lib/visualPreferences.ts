import { isNativeAppShell } from '@/lib/despiaBridge';

export const GLASS_INTENSITIES = ['calm', 'normal', 'max'] as const;
export const CONTRAST_MODES = ['normal', 'high'] as const;

export function defaultGlassIntensity(): typeof GLASS_INTENSITIES[number] {
  if (typeof navigator === 'undefined') return 'normal';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (/mac/i.test(navigator.platform || '') && navigator.maxTouchPoints > 1);
  return ios || isNativeAppShell() ? 'calm' : 'normal';
}
