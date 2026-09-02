import { Capacitor } from '@capacitor/core';
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';

export type DevicePlatform = 'ios' | 'android' | 'web';
export type WalletPreference = 'apple_pay' | 'google_pay' | 'standard';

const PAYMENT_OPEN_LOCK_MS = 1_500;
let paymentOpenLockedUntil = 0;

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

function parseHttpsUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

export function isApprovedStripeHostedUrl(value: string): boolean {
  const parsed = parseHttpsUrl(value);
  if (!parsed) return false;
  const host = parsed.hostname.toLowerCase();
  return host === 'stripe.com' || host.endsWith('.stripe.com');
}

function acquirePaymentOpenLock(): boolean {
  const now = Date.now();
  if (now < paymentOpenLockedUntil) return false;
  paymentOpenLockedUntil = now + PAYMENT_OPEN_LOCK_MS;
  return true;
}

/**
 * Open a hosted payment page without loading it inside the app WebView.
 * Despia/Capacitor shells use `_blank`, which the native shell routes to its
 * external browser surface. Normal browsers use same-tab navigation so an
 * asynchronously generated checkout link cannot be lost to a popup blocker.
 */
function openExternalPaymentUrl(url: string): boolean {
  const parsed = parseHttpsUrl(url);
  if (!parsed || !acquirePaymentOpenLock()) return false;

  if (isNativePurchaseShell()) {
    window.open(parsed.toString(), '_blank');
    return true;
  }

  window.location.assign(parsed.toString());
  return true;
}

/** Stripe-hosted Connect, Checkout, and Billing Portal URLs only. */
export function openStripeHostedUrl(url: string): boolean {
  if (!isApprovedStripeHostedUrl(url)) return false;
  return openExternalPaymentUrl(url);
}

/** Generic HTTPS checkout helper retained for existing non-Connect purchases. */
export function openCheckoutUrl(url: string): boolean {
  return openExternalPaymentUrl(url);
}

/** Test-only reset for deterministic duplicate-open coverage. */
export function __resetPaymentOpenLockForTests(): void {
  paymentOpenLockedUntil = 0;
}
