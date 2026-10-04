import { useRevenueCat } from './useRevenueCat';
import { useAuth } from '@/lib/auth';
import { useQuery } from '@tanstack/react-query';
import { verifiedPremiumStatus } from '@/lib/premiumGiftService';
import { useEffect, useState } from 'react';

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
  const { data: dbPremium, isLoading: dbLoading, isError: dbError, refetch } = useQuery({
    queryKey: ['db-premium-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return { is_owner: false, gift_active: false, active: false, can_manage_gifts: false, expires_at: null };
      return verifiedPremiumStatus(user.id);
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    refetchInterval: query => query.state.data?.active || query.state.data?.is_owner || query.state.data?.can_manage_gifts ? 60_000 : false,
  });

  const [, refreshExpiry] = useState(0);
  useEffect(() => {
    if (!dbPremium?.expires_at) return;
    const expiry = Date.parse(dbPremium.expires_at);
    if (!Number.isFinite(expiry)) return;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      const remaining = expiry - Date.now();
      if (remaining <= 0) { refreshExpiry(value => value + 1); void refetch(); }
      else timer = setTimeout(check, Math.min(remaining, 60_000));
    };
    check();
    return () => clearTimeout(timer);
  }, [dbPremium?.expires_at, user?.id, refetch]);
  const unexpired = dbPremium?.expires_at === null || (typeof dbPremium?.expires_at === 'string' && Date.parse(dbPremium.expires_at) > Date.now());

  const rcPremium = isEntitled(PREMIUM_ENTITLEMENT_ID);
  const isOwner = !dbError && dbPremium?.is_owner === true;
  const isGifted = !dbError && unexpired && dbPremium?.gift_active === true;
  const canManageGifts = !dbError && dbPremium?.can_manage_gifts === true;

  // Cosmetic gate — only true for real subscribers, owners, and gifted users.
  // Used to hide premium-only cosmetics until VYBE+ ships.
  const hasPremiumCosmetics = rcPremium || isOwner || isGifted || (!dbError && unexpired && dbPremium?.active === true);

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
    canManageGifts,
  };
}
