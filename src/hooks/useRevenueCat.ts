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

  useEffect(() => {
    const userId = profile?.id || undefined;
    const instance = initRevenueCat(userId);
    setPurchases(instance);

    // Fetch customer info
    instance.getCustomerInfo().then(info => {
      setCustomerInfo(info);
      setIsLoading(false);
    }).catch(() => setIsLoading(false));

    // Fetch offerings
    instance.getOfferings().then(offeringsResult => {
      const current = offeringsResult.current;
      if (current) {
        setOfferings(current.availablePackages);
      }
    }).catch(() => {});
  }, [profile?.id]);

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
    purchase,
    isEntitled,
    refresh,
  };
}
