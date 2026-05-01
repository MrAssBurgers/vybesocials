import { useEffect, useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Purchases as PurchasesNative } from '@revenuecat/purchases-capacitor';
import { initRevenueCat, getPurchases, resetRevenueCat } from '@/lib/revenuecat';
import { useAuth } from '@/lib/auth';
import type { Purchases, CustomerInfo, Package as RCPackage } from '@revenuecat/purchases-js';

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

/**
 * Unified RevenueCat hook.
 * - Web: uses @revenuecat/purchases-js
 * - iOS/Android: uses @revenuecat/purchases-capacitor (Google Play Billing v6.x on Android)
 *
 * `customerInfo`, `offerings`, and `purchase()` are normalized to the web SDK
 * shape so existing consumers (usePremiumStatus, CustomerCenter, paywalls)
 * continue to work unchanged.
 */
export function useRevenueCat() {
  const { profile } = useAuth();
  const [purchases, setPurchases] = useState<Purchases | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<RCPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ---------- Web loaders ----------
  const loadOfferingsWeb = useCallback(async (instance: Purchases) => {
    try {
      const result = await instance.getOfferings();
      const current = result.current;
      if (current && current.availablePackages.length > 0) {
        setOfferings(current.availablePackages);
        setError(null);
      } else {
        setError('no_offerings');
      }
    } catch {
      setError('offerings_failed');
    }
  }, []);

  // ---------- Native loaders ----------
  const loadOfferingsNative = useCallback(async () => {
    try {
      const result = await PurchasesNative.getOfferings();
      const current = result.current;
      if (current && current.availablePackages.length > 0) {
        // Cast to web Package shape — fields like identifier/product are compatible
        setOfferings(current.availablePackages as unknown as RCPackage[]);
        setError(null);
      } else {
        setError('no_offerings');
      }
    } catch {
      setError('offerings_failed');
    }
  }, []);

  // ---------- Initial load ----------
  useEffect(() => {
    let cancelled = false;
    const userId = profile?.id || undefined;

    if (isNative()) {
      // Configures the native plugin (idempotent inside initRevenueCat)
      initRevenueCat(userId);
      setPurchases(null); // native doesn't expose the web instance

      (async () => {
        try {
          const { customerInfo: info } = await PurchasesNative.getCustomerInfo();
          if (!cancelled) setCustomerInfo(info as unknown as CustomerInfo);
        } catch {
          /* noop */
        } finally {
          if (!cancelled) setIsLoading(false);
        }
        if (!cancelled) await loadOfferingsNative();
      })();

      return () => { cancelled = true; };
    }

    // Web path
    const instance = initRevenueCat(userId);
    setPurchases(instance);

    if (!instance) {
      setIsLoading(false);
      setError('init_failed');
      return;
    }

    instance.getCustomerInfo()
      .then(info => { if (!cancelled) setCustomerInfo(info); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setIsLoading(false); });

    loadOfferingsWeb(instance);
    return () => { cancelled = true; };
  }, [profile?.id, loadOfferingsWeb, loadOfferingsNative]);

  const retryLoadOfferings = useCallback(async () => {
    if (isNative()) {
      await loadOfferingsNative();
      return;
    }
    const instance = getPurchases();
    if (!instance) {
      resetRevenueCat();
      const userId = profile?.id || undefined;
      const newInstance = initRevenueCat(userId);
      setPurchases(newInstance);
      if (!newInstance) { setError('init_failed'); return; }
      await loadOfferingsWeb(newInstance);
    } else {
      await loadOfferingsWeb(instance);
    }
  }, [profile?.id, loadOfferingsWeb, loadOfferingsNative]);

  const purchase = useCallback(async (rcPackage: RCPackage) => {
    if (isNative()) {
      const result = await PurchasesNative.purchasePackage({
        aPackage: rcPackage as any,
      });
      const info = result.customerInfo as unknown as CustomerInfo;
      setCustomerInfo(info);
      return info;
    }

    const instance = getPurchases();
    if (!instance) throw new Error('RevenueCat not initialized');
    const { customerInfo: updatedInfo } = await instance.purchase({ rcPackage });
    setCustomerInfo(updatedInfo);
    return updatedInfo;
  }, []);

  const isEntitled = useCallback((entitlementId: string) => {
    if (!customerInfo) return false;
    return customerInfo.entitlements.active[entitlementId] !== undefined;
  }, [customerInfo]);

  const refresh = useCallback(async () => {
    if (isNative()) {
      try {
        // syncPurchases pulls latest from store, then refresh customer info
        await PurchasesNative.syncPurchases();
        const { customerInfo: info } = await PurchasesNative.getCustomerInfo();
        setCustomerInfo(info as unknown as CustomerInfo);
      } catch { /* noop */ }
      return;
    }
    const instance = getPurchases();
    if (!instance) return;
    const info = await instance.getCustomerInfo();
    setCustomerInfo(info);
  }, []);

  return {
    purchases,
    customerInfo,
    offerings,
    isLoading,
    error,
    purchase,
    isEntitled,
    refresh,
    retryLoadOfferings,
  };
}
