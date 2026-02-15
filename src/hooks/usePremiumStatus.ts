import { useRevenueCat } from './useRevenueCat';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PREMIUM_ENTITLEMENT_ID = 'premium';

export function usePremiumStatus() {
  const { isEntitled, isLoading: rcLoading, customerInfo } = useRevenueCat();
  const { user } = useAuth();

  // Check if user is owner or has gifted premium via DB
  const { data: dbPremium, isLoading: dbLoading } = useQuery({
    queryKey: ['db-premium-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return { isOwner: false, isGifted: false };

      // Check owner role
      const { data: ownerData } = await supabase
        .from('user_roles_auth')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle();

      // Check gifted premium
      const { data: giftedData } = await supabase
        .from('gifted_premium')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .is('revoked_at', null)
        .maybeSingle();

      return {
        isOwner: !!ownerData,
        isGifted: !!giftedData,
      };
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const rcPremium = isEntitled(PREMIUM_ENTITLEMENT_ID);
  const isPremium = rcPremium || dbPremium?.isOwner || dbPremium?.isGifted || false;
  const isLoading = rcLoading || dbLoading;

  return {
    isPremium,
    isLoading,
    customerInfo,
    isOwner: dbPremium?.isOwner || false,
    isGifted: dbPremium?.isGifted || false,
  };
}
