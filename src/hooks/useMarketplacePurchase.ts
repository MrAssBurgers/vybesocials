import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

/**
 * Hook to purchase a marketplace item via the atomic RPC.
 * Deducts tokens, records purchase, and invalidates caches.
 */
export function useMarketplacePurchase() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const ownerId = profileId ?? user?.id;
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, cost, name }: { itemId: string; cost: number; name: string }) => {
      if (!ownerId) throw new Error('Not authenticated');

      const { data: rlData } = await db.rpc('check_rate_limit', {
        p_key: `marketplace_purchase:${ownerId}`,
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

      const result = data as { success?: boolean; error?: string; new_balance?: number } | null;
      if (!result?.success) {
        throw new Error(result?.error || 'Purchase failed');
      }

      return result;
    },
    onSuccess: () => {
      triggerHaptic('success');
      qc.invalidateQueries({ queryKey: ['vybe-tokens', ownerId] });
      qc.invalidateQueries({ queryKey: ['vybe-tokens'] });
      qc.invalidateQueries({ queryKey: ['token-transactions', ownerId] });
      qc.invalidateQueries({ queryKey: ['token-transactions', user?.id] });
      qc.invalidateQueries({ queryKey: ['marketplace-purchases', ownerId] });
      qc.invalidateQueries({ queryKey: ['marketplace-purchases', user?.id] });
      qc.invalidateQueries({ queryKey: ['marketplace-purchases', profileId] });
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
