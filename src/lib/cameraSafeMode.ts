import { isNativeAppShell } from '@/lib/despiaBridge';

/**
 * True on Play Store / Despia WebView, phones, and tablets.
 * Used to disable AR/MediaPipe, lighten getUserMedia, and skip CSS filters that crash GPU compositors.
 */
export function isCameraSafeMode(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  if (isNativeAppShell()) return true;

  const ua = navigator.userAgent || '';
  if (/android|iphone|ipad|ipod/i.test(ua)) return true;
  if (/; wv\)|\bwv\b/i.test(ua)) return true;

  const touch = navigator.maxTouchPoints > 0;
  const narrow = window.innerWidth < 1024;
  if (touch && narrow) return true;

  return false;
}
