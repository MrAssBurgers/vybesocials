import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useRevenueCat } from '@/hooks/useRevenueCat';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';
import { isDespiaRuntime, isNativeAppShell } from '@/lib/despiaBridge';
import { db } from '@/lib/firebase';

const PREMIUM_ENTITLEMENT_ID = 'Vybe Social Pro';

/** Web AdSense — flip when approved. Native uses Despia AdMob regardless. */
export const WEB_ADSENSE_ENABLED = false;

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Single source of truth for ad gates.
 *
 * NOTE: `usePremiumStatus().isPremium` is forced true for everyone during VYBE+ build —
 * we must NOT use it here. Ads are skipped only for real RevenueCat subscribers.
 *
 * ATT "Don't Allow" still shows ads (non-personalized). Only COPPA under-13 blocks ads.
 */
export function useAdEligibility() {
  const { user } = useAuth();
  const { isEntitled, isLoading: rcLoading } = useRevenueCat();

  const { data: userAge, isLoading: ageLoading } = useQuery({
    queryKey: ['user-age-ads', user?.id],
    queryFn: async () => {
      const { data, error } = await db.rpc('get_own_sensitive_profile');
      if (error || !data) return null;
      const dob = (data as { date_of_birth?: string }).date_of_birth;
      if (!dob) return null;
      return calculateAge(dob);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 60,
  });

  const isUnder13 = typeof userAge === 'number' && userAge < 13;
  const isAdFreeSubscriber = isEntitled(PREMIUM_ENTITLEMENT_ID);
  const consent = getTrackingConsent();
  // Personalized ads only after ATT Allow (or web consent). Deny → non-personalized ads still OK.
  const personalizedAds = consent === 'allowed';
  const onNative = isNativeAppShell();
  const isLoading = rcLoading || ageLoading;

  const showNativeAds = onNative && !rcLoading && !isAdFreeSubscriber && !isUnder13;
  /** Wallet Watch & Earn — Despia rewarded bridge; don't block on RC/age spinners. */
  const canUseDespiaRewardedAds =
    isDespiaRuntime() && !isAdFreeSubscriber && !isUnder13;
  const showWebAds =
    !onNative &&
    WEB_ADSENSE_ENABLED &&
    !rcLoading &&
    !isAdFreeSubscriber &&
    !isUnder13 &&
    consent !== null;

  return {
    showNativeAds,
    canUseDespiaRewardedAds,
    showWebAds,
    showAds: showNativeAds || showWebAds,
    personalizedAds,
    isAdFreeSubscriber,
    isUnder13,
    isLoading,
    childDirected: isUnder13,
  };
}
