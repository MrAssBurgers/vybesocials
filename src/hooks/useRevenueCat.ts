import { useEffect, useState, useCallback } from 'react';
import { initRevenueCat, getPurchases, resetRevenueCat } from '@/lib/revenuecat';
import { useAuth } from '@/lib/auth';
import type { Purchases, CustomerInfo, Package as RCPackage } from '@revenuecat/purchases-js';

export function useRevenueCat() {
  const { profile } = useAuth();
  const [purchases, setPurchases] = useState<Purchases | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<RCPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOfferings = useCallback(async (instance: Purchases) => {
    try {
      const offeringsResult = await instance.getOfferings();
      const current = offeringsResult.current;
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

  useEffect(() => {
    const userId = profile?.id || undefined;
    const instance = initRevenueCat(userId);
    setPurchases(instance);

    if (!instance) {
      setIsLoading(false);
      setError('init_failed');
      return;
    }

    // Fetch customer info
    instance.getCustomerInfo().then(info => {
      setCustomerInfo(info);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Fetch offerings
    loadOfferings(instance);
  }, [profile?.id, loadOfferings]);

  const retryLoadOfferings = useCallback(async () => {
    const instance = getPurchases();
    if (!instance) {
      // Try re-initializing
      resetRevenueCat();
      const userId = profile?.id || undefined;
      const newInstance = initRevenueCat(userId);
      setPurchases(newInstance);
      if (!newInstance) {
        setError('init_failed');
        return;
      }
      await loadOfferings(newInstance);
    } else {
      await loadOfferings(instance);
    }
  }, [profile?.id, loadOfferings]);

  const purchase = useCallback(async (rcPackage: RCPackage) => {
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
