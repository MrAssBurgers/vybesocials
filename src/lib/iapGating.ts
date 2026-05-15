/**
 * iOS In-App Purchase Gating.
 *
 * Apple's App Store Review Guideline 3.1.1 requires digital-goods purchases
 * (subscriptions like VYBE Pro, gifted premium, in-app currency) to use
 * StoreKit / IAP — NOT external payment processors like Stripe.
 *
 * On iOS and Android native shells we route through RevenueCat so Apple uses
 * StoreKit and Android uses Google Play Billing. Web keeps Stripe checkout,
 * where Stripe displays Apple Pay / Google Pay based on the browser device.
 *
 * Use `usePaymentProvider()` (or `getPaymentProvider()`) at any paywall entry
 * point to decide which UI to show.
 */

import { getDevicePlatform, isNativePurchaseShell } from './platformPayments';

export type PaymentProvider = 'stripe' | 'revenuecat-ios' | 'revenuecat-android';

export function getPaymentProvider(): PaymentProvider {
  if (isNativePurchaseShell()) {
    const platform = getDevicePlatform();
    if (platform === 'ios') return 'revenuecat-ios';
    if (platform === 'android') return 'revenuecat-android';
  }
  return 'stripe';
}

/** True if this build must use Apple IAP for digital goods. */
export function mustUseAppleIAP(): boolean {
  return getPaymentProvider() === 'revenuecat-ios';
}

/** True if this build must use Google Play Billing for digital goods. */
export function mustUseGooglePlayBilling(): boolean {
  return getPaymentProvider() === 'revenuecat-android';
}

/** True when app-store billing is required for digital goods. */
export function mustUseNativeIAP(): boolean {
  const provider = getPaymentProvider();
  return provider === 'revenuecat-ios' || provider === 'revenuecat-android';
}
