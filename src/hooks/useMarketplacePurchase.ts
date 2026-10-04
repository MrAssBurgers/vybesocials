import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';
import { tokenAttempt, tokenMarketplaceRequest } from '@/lib/tokenMarketplaceService';
import { useTokenAction } from './useTokenMarketplaceState';
import { playSound } from '@/lib/sounds';

export function useMarketplacePurchase() {
  return useTokenAction(async ({ itemId, cost }: { itemId: string; cost: number; name: string }, guard, uid) => {
    guard();
    const attempt = tokenAttempt('purchase', uid, itemId, cost);
    const result = await tokenMarketplaceRequest({ action: 'purchase', itemId, expectedCost: cost, requestId: attempt.requestId }, guard);
    guard(); attempt.complete();
    return result;
  }, () => { triggerHaptic('success'); playSound('success'); }, error => toast.error(error.message));
}
