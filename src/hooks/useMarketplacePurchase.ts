import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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

      const { data, error } = await supabase.rpc('purchase_marketplace_item', {
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
    },
    onError: (error: Error) => {
      triggerHaptic('error');
      toast.error(error.message);
    },
  });
}
