import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useRevenueCat } from '@/hooks/useRevenueCat';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { db } from '@/lib/firebase';
import { calculateAgeFromDateOfBirth, resolveAdPrivacy } from '@/lib/adPrivacy';
import { TRACKING_CONSENT_CHANGED_EVENT } from '@/lib/att';

const PREMIUM_ENTITLEMENT_ID = 'Vybe Social Pro';

/** Web AdSense — flip when approved. Native uses Despia AdMob regardless. */
export const WEB_ADSENSE_ENABLED = import.meta.env.VITE_ENABLE_WEB_ADSENSE === 'true';

/**
 * Single source of truth for ad gates.
 *
 * NOTE: `usePremiumStatus().isPremium` is forced true for everyone during VYBE+ build —
 * we must NOT use it here. Ads are skipped only for real RevenueCat subscribers.
 *
 * ATT "Don't Allow" can still show explicitly non-personalized inline ads.
 * Interstitial/rewarded bridges are separately restricted because the web
 * layer cannot attach a per-request NPA flag to those native calls.
 */
export function useAdEligibility() {
  const { user } = useAuth();
  const { isEntitled, isLoading: rcLoading } = useRevenueCat();
  const [consent, setConsent] = useState(() => getTrackingConsent());

  useEffect(() => {
    const refreshConsent = () => setConsent(getTrackingConsent());
    window.addEventListener(TRACKING_CONSENT_CHANGED_EVENT, refreshConsent);
    window.addEventListener('storage', refreshConsent);
    return () => {
      window.removeEventListener(TRACKING_CONSENT_CHANGED_EVENT, refreshConsent);
      window.removeEventListener('storage', refreshConsent);
    };
  }, []);

  const { data: userAge, isLoading: ageLoading } = useQuery({
    queryKey: ['user-age-ads', user?.id],
    queryFn: async () => {
      const { data, error } = await db.rpc('get_own_sensitive_profile');
      if (error || !data) return null;
      const dob = (data as { date_of_birth?: string }).date_of_birth;
      if (!dob) return null;
      return calculateAgeFromDateOfBirth(dob);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 60,
  });

  const isAdFreeSubscriber = isEntitled(PREMIUM_ENTITLEMENT_ID);
  const privacy = resolveAdPrivacy(userAge, consent);
  const { consentResolved, isUnder13, isMinor, personalizedAds } = privacy;
  const onNative = isNativeAppShell();
  const isLoading = rcLoading || ageLoading;

  // Never make an ad request while ATT/privacy status is unresolved.
  const showNativeAds = onNative && consentResolved && !isLoading && !isAdFreeSubscriber && !isUnder13;
  /**
   * Despia rewarded/interstitial bridge URLs cannot carry a per-request NPA
   * signal from this web layer. Fail closed unless the user is a consenting adult.
   */
  const canUseDespiaRewardedAds =
    isDespiaRuntime() && personalizedAds && !isLoading && !isAdFreeSubscriber;
  const showWebAds =
    !onNative &&
    WEB_ADSENSE_ENABLED &&
    !rcLoading &&
    !isAdFreeSubscriber &&
    !isUnder13 &&
    consentResolved;

  return {
    showNativeAds,
    canUseDespiaRewardedAds,
    showWebAds,
    showAds: showNativeAds || showWebAds,
    personalizedAds,
    isAdFreeSubscriber,
    isUnder13,
    isMinor,
    consentResolved,
    isLoading,
    childDirected: isUnder13,
  };
}
