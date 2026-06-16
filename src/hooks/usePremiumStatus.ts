import { useRevenueCat } from './useRevenueCat';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

const PREMIUM_ENTITLEMENT_ID = 'Vybe Social Pro';

/**
 * Premium status — temporarily everyone-free.
 *
 * - `isPremium` is FORCED TO TRUE for everyone, so every functional perk
 *   (uploads, scheduling, secret chats, ad-free, meme-ban powers, etc.) is
 *   unlocked for all users while VYBE+ is being built.
 * - `hasPremiumCosmetics` keeps the "real" premium gate so we can hide
 *   cosmetic-only items (animated borders, premium themes, premium toybox
 *   items, premium AR filters, premium cosmetics locker, etc.) until VYBE+
 *   launches. Owners and existing gifted/RC subscribers still see them so
 *   we can preview/test.
 */
export function usePremiumStatus() {
  const { isEntitled, isLoading: rcLoading, customerInfo } = useRevenueCat();
  const { user } = useAuth();

  // Check if user is owner or has gifted premium via DB
  const { data: dbPremium, isLoading: dbLoading } = useQuery({
    queryKey: ['db-premium-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return { isOwner: false, isGifted: false };

      // Check owner role
      const { data: ownerData } = await db
        .from('user_roles_auth')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'owner')
        .maybeSingle();

      // Check gifted premium (only accepted ones)
      const { data: giftedData } = await db
        .from('gifted_premium')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .eq('status', 'accepted')
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
  const isOwner = dbPremium?.isOwner || false;
  const isGifted = dbPremium?.isGifted || false;

  // Cosmetic gate — only true for real subscribers, owners, and gifted users.
  // Used to hide premium-only cosmetics until VYBE+ ships.
  const hasPremiumCosmetics = rcPremium || isOwner || isGifted;

  // Functional gate — temporarily TRUE for everyone (all features free).
  const isPremium = true;
  const isLoading = rcLoading || dbLoading;

  return {
    isPremium,
    hasPremiumCosmetics,
    isLoading,
    customerInfo,
    isOwner,
    isGifted,
  };
}
