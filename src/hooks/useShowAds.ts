import { usePremiumStatus } from './usePremiumStatus';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';

/**
 * Determines whether to show ads to the current user.
 * 
 * Ads are hidden for:
 * - Premium/VYBE+ subscribers
 * - Users who denied tracking consent
 */
export function useShowAds() {
  const { isPremium, isLoading } = usePremiumStatus();
  
  // Only show ads if tracking is allowed and user is not premium
  const trackingAllowed = getTrackingConsent() === 'allowed';
  const showAds = !isLoading && !isPremium && trackingAllowed;

  return { showAds, isPremium, isLoading };
}
