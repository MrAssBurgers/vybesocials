import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { tokenAttempt, tokenMarketplaceRequest } from '@/lib/tokenMarketplaceService';
import { useTokenAction, useTokenMarketplaceState } from './useTokenMarketplaceState';

export type BoostType = 'xp_2x' | 'tokens_2x' | 'visibility' | 'streak_shield' | 'roulette_spins';
export interface ActiveBoost {
  id: string; boost_type: BoostType; source_item_id: string | null; activated_at: string;
  expires_at: string | null; uses_remaining: number | null; consumed: boolean;
}
export function useActiveBoosts() {
  const state = useTokenMarketplaceState();
  return { ...state, data: state.isError ? undefined : state.data?.boosts.filter(boost => !boost.consumed
    && (boost.expires_at === null || Date.parse(boost.expires_at) > Date.now())
    && (boost.uses_remaining === null || boost.uses_remaining > 0)) };
}
export function useHasBoost(type: BoostType): boolean { return useActiveBoosts().data?.some(boost => boost.boost_type === type) ?? false; }
export function useActivateBoost() {
  return useTokenAction(async ({ itemId }: { itemId: string; name: string }, guard, uid) => {
    guard(); const attempt = tokenAttempt('activate', uid, itemId);
    const result = await tokenMarketplaceRequest({ action: 'activate', itemId, requestId: attempt.requestId }, guard);
    guard(); attempt.complete(); return result;
  }, (result, input) => {
    if (result.boost?.consumed || !result.boost?.expires_at || Date.parse(result.boost.expires_at) <= Date.now()) {
      toast.info('That activation has ended. Any remaining boost is still in your inventory.');
      return;
    }
    triggerHaptic('success'); toast.success(`${input.name} activated!`);
  }, error => toast.error(error.message));
}
