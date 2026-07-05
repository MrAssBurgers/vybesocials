import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Purchases as PurchasesNative } from '@revenuecat/purchases-capacitor';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { initRevenueCat, getPurchases, resetRevenueCat } from '@/lib/revenuecat';
import { useAuth } from '@/lib/auth';
import { isDespiaAppShell } from '@/lib/platformPayments';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Purchases, CustomerInfo, Package as RCPackage } from '@revenuecat/purchases-js';

const isNative = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

type DespiaInvoke = (url: string) => Promise<unknown>;

/**
 * Packages can come from the web SDK (identifier) or be native-shaped
 * (product.identifier) when running inside an app shell.
 */
function resolveProductId(rcPackage: RCPackage): string | null {
  const pkg = rcPackage as RCPackage & { product?: { identifier?: string } };
  return pkg.product?.identifier || pkg.identifier || null;
}

async function launchDespiaPurchase(rcPackage: RCPackage, appUserId?: string): Promise<CustomerInfo | null> {
  const m = await import('despia-native');
  const despia = ((m as { default?: DespiaInvoke }).default ?? m) as DespiaInvoke;
  const productId = resolveProductId(rcPackage);
  if (!productId) throw new Error('Purchase product unavailable');
  const externalId = encodeURIComponent(appUserId || 'anonymous');
  const product = encodeURIComponent(productId);
  await despia(`revenuecat://purchase?external_id=${externalId}&product=${product}`);
  return null;
}

/**
 * Unified RevenueCat hook.
 * Shared across the app via React Query so 20+ consumers don't each fire
 * their own offerings / customerInfo fetches (huge perf win on slow internet).
 */
export function useRevenueCat() {
  const { profile } = useAuth();
  const qc = useQueryClient();
  const userId = profile?.id || undefined;

  // Initialize once per userId (init is idempotent inside initRevenueCat).
  useEffect(() => {
    initRevenueCat(userId);
  }, [userId]);

  const purchases: Purchases | null = isNative() ? null : (getPurchases() ?? null);

  const customerInfoQ = useQuery({
    queryKey: ['rc-customer-info', userId ?? 'anon'],
    queryFn: async (): Promise<CustomerInfo | null> => {
      if (isNative()) {
        try {
          const { customerInfo } = await PurchasesNative.getCustomerInfo();
          return customerInfo as unknown as CustomerInfo;
        } catch { return null; }
      }
      const instance = getPurchases();
      if (!instance) return null;
      try { return await instance.getCustomerInfo(); } catch { return null; }
    },
    // Long cache window — entitlements rarely change. Avoids hammering RC on
    // every component mount / route change / slow-network reconnect.
    staleTime: 10 * 60 * 1000,        // 10 min
    gcTime: 60 * 60 * 1000,           // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const offeringsQ = useQuery({
    queryKey: ['rc-offerings', userId ?? 'anon'],
    queryFn: async (): Promise<RCPackage[]> => {
      if (isNative()) {
        try {
          const result = await PurchasesNative.getOfferings();
          const current = result.current;
          return (current?.availablePackages ?? []) as unknown as RCPackage[];
        } catch { return []; }
      }
      const instance = getPurchases();
      if (!instance) return [];
      try {
        const result = await instance.getOfferings();
        return result.current?.availablePackages ?? [];
      } catch { return []; }
    },
    staleTime: 30 * 60 * 1000,        // 30 min
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  });

  const customerInfo = customerInfoQ.data ?? null;
  const offerings = offeringsQ.data ?? [];
  const isLoading = customerInfoQ.isLoading || offeringsQ.isLoading;
  const error = offeringsQ.isError
    ? 'offerings_failed'
    : (!offeringsQ.isLoading && offerings.length === 0 ? 'no_offerings' : null);

  const retryLoadOfferings = useCallback(async () => {
    if (!isNative()) {
      if (!getPurchases()) {
        resetRevenueCat();
        initRevenueCat(userId);
      }
    }
    await qc.invalidateQueries({ queryKey: ['rc-offerings', userId ?? 'anon'] });
  }, [qc, userId]);

  const purchase = useCallback(async (rcPackage: RCPackage) => {
    if (isNative()) {
      // On native, offerings were fetched from the Capacitor SDK, so the
      // package IS a PurchasesPackage — the web type is just our shared alias.
      const result = await PurchasesNative.purchasePackage({
        aPackage: rcPackage as unknown as PurchasesPackage,
      });
      const info = result.customerInfo as unknown as CustomerInfo;
      qc.setQueryData(['rc-customer-info', userId ?? 'anon'], info);
      return info;
    }

    if (isDespiaAppShell()) {
      return await launchDespiaPurchase(rcPackage, userId);
    }

    const instance = getPurchases();
    if (!instance) throw new Error('RevenueCat not initialized');
    const { customerInfo: updatedInfo } = await instance.purchase({ rcPackage });
    qc.setQueryData(['rc-customer-info', userId ?? 'anon'], updatedInfo);
    return updatedInfo;
  }, [qc, userId]);

  const isEntitled = useCallback((entitlementId: string) => {
    if (!customerInfo) return false;
    return customerInfo.entitlements.active[entitlementId] !== undefined;
  }, [customerInfo]);

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['rc-customer-info', userId ?? 'anon'] });
  }, [qc, userId]);

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
