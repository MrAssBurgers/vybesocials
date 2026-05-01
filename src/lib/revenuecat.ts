import { Purchases as PurchasesWeb } from "@revenuecat/purchases-js";
import { Capacitor } from "@capacitor/core";
import {
  Purchases as PurchasesNative,
  LOG_LEVEL,
} from "@revenuecat/purchases-capacitor";

// Public SDK keys (safe in client per RevenueCat docs)
const RC_WEB_KEY = "test_RKEtWiYduGWkOAOfNcaCRgTsyfC";
// TODO: replace with your real RC platform keys (Android = Google Play Billing v6+)
const RC_ANDROID_KEY = "goog_YOUR_ANDROID_PUBLIC_SDK_KEY";
const RC_IOS_KEY = "appl_YOUR_IOS_PUBLIC_SDK_KEY";

let purchasesInstance: PurchasesWeb | null = null;
let nativeConfigured = false;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Initialize RevenueCat.
 * - Native (iOS/Android): configures @revenuecat/purchases-capacitor
 *   (Android plugin uses Google Play Billing Library v6.x internally —
 *   QueryPurchaseHistoryParams / PurchaseHistoryResponseListener supported).
 * - Web: configures @revenuecat/purchases-js and returns the instance for hooks.
 */
export function initRevenueCat(appUserId?: string): PurchasesWeb | null {
  if (isNative()) {
    if (nativeConfigured) return null;
    try {
      const platform = Capacitor.getPlatform();
      const apiKey = platform === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
      PurchasesNative.setLogLevel({ level: LOG_LEVEL.WARN });
      PurchasesNative.configure({ apiKey, appUserID: appUserId });
      nativeConfigured = true;
    } catch (e) {
      console.warn("[RevenueCat native] Failed to initialize:", (e as Error).message);
    }
    // Web hook expects a PurchasesWeb-shaped instance; on native, hooks should
    // be migrated to PurchasesNative. Returning null keeps web flow safe.
    return null;
  }

  if (purchasesInstance) return purchasesInstance;
  try {
    const userId = appUserId || PurchasesWeb.generateRevenueCatAnonymousAppUserId();
    purchasesInstance = PurchasesWeb.configure({
      apiKey: RC_WEB_KEY,
      appUserId: userId,
    });
    return purchasesInstance;
  } catch (e) {
    console.warn("[RevenueCat] Failed to initialize:", (e as Error).message);
    return null;
  }
}

export function getPurchases(): PurchasesWeb | null {
  return purchasesInstance;
}

export function resetRevenueCat() {
  purchasesInstance = null;
  nativeConfigured = false;
}
