import { usePremiumStatus } from './usePremiumStatus';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';

/**
 * Global kill switch for ads.
 * Set to `true` once the site passes AdSense review and real slot IDs are configured.
 */
const ADS_ENABLED = false;

/**
 * Determines whether to show ads to the current user.
 * 
 * Ads are hidden for:
 * - When ADS_ENABLED is false (AdSense not yet approved)
 * - Premium/VYBE+ subscribers
 * - Users who denied tracking consent
 */
export function useShowAds() {
  const { isPremium, isLoading } = usePremiumStatus();
  
  const trackingAllowed = getTrackingConsent() === 'allowed';
  const showAds = ADS_ENABLED && !isLoading && !isPremium && trackingAllowed;

  return { showAds, isPremium, isLoading };
}
