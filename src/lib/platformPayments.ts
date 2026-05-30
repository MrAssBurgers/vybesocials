import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';

export type DevicePlatform = 'ios' | 'android' | 'web';
export type WalletPreference = 'apple_pay' | 'google_pay' | 'standard';

export function getDevicePlatform(): DevicePlatform {
  try {
    const platform = Capacitor.getPlatform();
    if (platform === 'ios' || platform === 'android') return platform;
  } catch {}

  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/i.test(ua)) return 'ios';
  if (/MacIntel/i.test(platform) && (navigator.maxTouchPoints || 0) > 1) return 'ios';
  return 'web';
}

export function isDespiaAppShell(): boolean {
  return isDespiaRuntime();
}

export function isNativePurchaseShell(): boolean {
  return isNativeAppShell();
}

export function getWalletPreference(): WalletPreference {
  const platform = getDevicePlatform();
  if (platform === 'ios') return 'apple_pay';
  if (platform === 'android') return 'google_pay';
  return 'standard';
}

export function getPaymentClientContext() {
  return {
    client_platform: getDevicePlatform(),
    wallet_preference: getWalletPreference(),
    native_shell: isNativePurchaseShell(),
  };
}

export function openCheckoutUrl(url: string): void {
  if (!url) return;
  if (isNativePurchaseShell() || getDevicePlatform() !== 'web') {
    window.location.href = url;
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
