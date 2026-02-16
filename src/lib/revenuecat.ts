import { Purchases } from "@revenuecat/purchases-js";

const RC_API_KEY = "strp_SkbSwPUtSceVNlhfkHxqgnAnHBc";

let purchasesInstance: Purchases | null = null;

export function initRevenueCat(appUserId?: string): Purchases | null {
  if (purchasesInstance) return purchasesInstance;

  try {
    const userId = appUserId || Purchases.generateRevenueCatAnonymousAppUserId();
    purchasesInstance = Purchases.configure({
      apiKey: RC_API_KEY,
      appUserId: userId,
    });
    return purchasesInstance;
  } catch (e) {
    console.warn('[RevenueCat] Failed to initialize:', (e as Error).message);
    return null;
  }
}

export function getPurchases(): Purchases | null {
  return purchasesInstance;
}

export function resetRevenueCat() {
  purchasesInstance = null;
}
