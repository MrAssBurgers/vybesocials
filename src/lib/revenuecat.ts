import { Purchases } from "@revenuecat/purchases-js";

const RC_API_KEY = "strp_SkbSwPUtSceVNlhfkHxqgnAnHBc";

let purchasesInstance: Purchases | null = null;

export function initRevenueCat(appUserId?: string): Purchases {
  if (purchasesInstance) return purchasesInstance;

  const userId = appUserId || Purchases.generateRevenueCatAnonymousAppUserId();
  purchasesInstance = Purchases.configure({
    apiKey: RC_API_KEY,
    appUserId: userId,
  });

  return purchasesInstance;
}

export function getPurchases(): Purchases | null {
  return purchasesInstance;
}

export function resetRevenueCat() {
  purchasesInstance = null;
}
