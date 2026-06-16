import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

/**
 * Hook to purchase a marketplace item via the atomic RPC.
 * Deducts tokens, records purchase, and invalidates caches.
 */
export function useMarketplacePurchase() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, cost, name }: { itemId: string; cost: number; name: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Rate-limit: max 10 purchases per minute
      const { data: rlData } = await db.rpc('check_rate_limit', {
        p_key: `marketplace_purchase:${user.id}`,
        p_max_requests: 10,
        p_window_seconds: 60,
      });
      if (rlData === false) throw new Error('Too many purchases — try again in a minute');

      const { data, error } = await db.rpc('purchase_marketplace_item', {
        p_item_id: itemId,
        p_cost: cost,
        p_description: `Purchased: ${name}`,
      });

      if (error) throw error;

      const result = data as any;
      if (!result?.success) {
        throw new Error(result?.error || 'Purchase failed');
      }

      return result;
    },
    onSuccess: (_data, variables) => {
      triggerHaptic('success');
      toast.success(`Purchased ${variables.name}!`);
      qc.invalidateQueries({ queryKey: ['vybe-tokens', user?.id] });
      qc.invalidateQueries({ queryKey: ['token-transactions', user?.id] });
      // Critical: refresh the "Owned" badge + auto-equip flow on the marketplace card
      qc.invalidateQueries({ queryKey: ['marketplace-purchases', user?.id] });
      qc.invalidateQueries({ queryKey: ['locker-items'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['profile-by-id'] });
      qc.invalidateQueries({ queryKey: ['display-style'] });
    },
    onError: (error: Error) => {
      triggerHaptic('error');
      toast.error(error.message);
    },
  });
}
