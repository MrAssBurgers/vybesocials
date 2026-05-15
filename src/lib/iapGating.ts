/**
 * iOS In-App Purchase Gating.
 *
 * Apple's App Store Review Guideline 3.1.1 requires digital-goods purchases
 * (subscriptions like VYBE Pro, gifted premium, in-app currency) to use
 * StoreKit / IAP — NOT external payment processors like Stripe.
 *
 * On iOS we route to RevenueCat. Everywhere else (web, Android), we keep
 * Stripe paywalls.
 *
 * Use `usePaymentProvider()` (or `getPaymentProvider()`) at any paywall entry
 * point to decide which UI to show.
 */

import { isIOS, isNativePlatform } from './capacitor';

export type PaymentProvider = 'stripe' | 'revenuecat-ios';

export function getPaymentProvider(): PaymentProvider {
  if (isNativePlatform && isIOS) return 'revenuecat-ios';
  return 'stripe';
}

/** True if this build must use Apple IAP for digital goods. */
export function mustUseAppleIAP(): boolean {
  return getPaymentProvider() === 'revenuecat-ios';
}
