import { useQuery } from '@tanstack/react-query';
import { usePremiumStatus } from './usePremiumStatus';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { isNativeAppShell } from '@/lib/despiaBridge';

function calculateAge(dob: string): number {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Determines whether to show ads to the current user.
 *
 * Ads are hidden for:
 * - When ADS_ENABLED is false (AdSense not yet approved)
 * - Premium/VYBE+ subscribers
 * - Users who denied tracking consent
 * - Users under 13 (COPPA compliance)
 *
 * Returns `childDirected: true` for users under 13 — used to tag ad requests
 * with `data-tag-for-child-directed-treatment="1"` per Google's COPPA policy.
 */
export function useShowAds() {
  const { user } = useAuth();
  const { isPremium, isLoading } = usePremiumStatus();

  const { data: userAge } = useQuery({
    queryKey: ['user-age-ads', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_own_sensitive_profile');
      if (error || !data) return null;
      const dob = (data as any).date_of_birth;
      if (!dob) return null;
      return calculateAge(dob);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 60,
  });

  const isUnder13 = typeof userAge === 'number' && userAge < 13;
  const trackingAllowed = getTrackingConsent() === 'allowed';
  // AdSense is web-only. Native (Capacitor) and Despia APK use AdMob (see useVideoAds).
  const onWebOnly = !isNativeAppShell();
  const showAds = ADS_ENABLED && onWebOnly && !isLoading && !isPremium && trackingAllowed && !isUnder13;

  return { showAds, isPremium, isLoading, childDirected: isUnder13 };
}
