import { useRevenueCat } from './useRevenueCat';

const PREMIUM_ENTITLEMENT_ID = 'premium';

export function usePremiumStatus() {
  const { isEntitled, isLoading, customerInfo } = useRevenueCat();
  
  const isPremium = isEntitled(PREMIUM_ENTITLEMENT_ID);
  
  return {
    isPremium,
    isLoading,
    customerInfo,
  };
}
