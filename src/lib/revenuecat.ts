import { Capacitor } from "@capacitor/core";

// Public SDK keys (safe in client per RevenueCat docs)
const RC_WEB_KEY = "test_RKEtWiYduGWkOAOfNcaCRgTsyfC";
// TODO: replace with your real RC platform keys (Android = Google Play Billing v6+)
const RC_ANDROID_KEY = "goog_YOUR_ANDROID_PUBLIC_SDK_KEY";
const RC_IOS_KEY = "appl_YOUR_IOS_PUBLIC_SDK_KEY";

type PurchasesWeb = import("@revenuecat/purchases-js").Purchases;

let purchasesInstance: PurchasesWeb | null = null;
let nativeConfigured = false;
let webInitPromise: Promise<PurchasesWeb | null> | null = null;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Initialize RevenueCat (lazy — web SDK is dynamically imported).
 * - Native (iOS/Android): configures @revenuecat/purchases-capacitor
 * - Web: configures @revenuecat/purchases-js and returns the instance for hooks.
 */
export async function initRevenueCat(appUserId?: string): Promise<PurchasesWeb | null> {
  if (isNative()) {
    if (nativeConfigured) return null;
    try {
      const { Purchases: PurchasesNative, LOG_LEVEL } = await import(
        "@revenuecat/purchases-capacitor"
      );
      const platform = Capacitor.getPlatform();
      const apiKey = platform === "ios" ? RC_IOS_KEY : RC_ANDROID_KEY;
      await PurchasesNative.setLogLevel({ level: LOG_LEVEL.WARN });
      await PurchasesNative.configure({ apiKey, appUserID: appUserId });
      nativeConfigured = true;
    } catch (e) {
      console.warn("[RevenueCat native] Failed to initialize:", (e as Error).message);
    }
    return null;
  }

  if (purchasesInstance) return purchasesInstance;
  if (webInitPromise) return webInitPromise;

  webInitPromise = (async () => {
    try {
      const { Purchases: PurchasesWeb } = await import("@revenuecat/purchases-js");
      const userId = appUserId || PurchasesWeb.generateRevenueCatAnonymousAppUserId();
      purchasesInstance = PurchasesWeb.configure({
        apiKey: RC_WEB_KEY,
        appUserId: userId,
      });
      return purchasesInstance;
    } catch (e) {
      console.warn("[RevenueCat] Failed to initialize:", (e as Error).message);
      return null;
    } finally {
      webInitPromise = null;
    }
  })();

  return webInitPromise;
}

export function getPurchases(): PurchasesWeb | null {
  return purchasesInstance;
}

export function resetRevenueCat() {
  purchasesInstance = null;
  nativeConfigured = false;
  webInitPromise = null;
}
