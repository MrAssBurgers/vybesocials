import { useAdEligibility } from '@/hooks/useAdEligibility';

/**
 * Determines whether to show ads to the current user.
 * Delegates to useAdEligibility (single RPC + RevenueCat gate).
 */
export function useShowAds() {
  const {
    showAds,
    showNativeAds,
    showWebAds,
    personalizedAds,
    isAdFreeSubscriber,
    isLoading,
    childDirected,
  } = useAdEligibility();

  return {
    showAds,
    showNativeAds,
    showWebAds,
    personalizedAds,
    isPremium: isAdFreeSubscriber,
    isLoading,
    childDirected,
  };
}
