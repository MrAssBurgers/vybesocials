import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { triggerHaptic } from '@/lib/haptics';

export type BoostType =
  | 'xp_2x'
  | 'tokens_2x'
  | 'visibility'
  | 'streak_shield'
  | 'roulette_spins';

export interface ActiveBoost {
  id: string;
  boost_type: BoostType;
  source_item_id: string | null;
  activated_at: string;
  expires_at: string | null;
  uses_remaining: number | null;
  consumed: boolean;
}

/**
 * Returns the user's currently active boosts (not consumed, not expired,
 * uses remaining). Used to apply XP/token multipliers, show banners, etc.
 */
export function useActiveBoosts() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['active-boosts', user?.id],
    queryFn: async (): Promise<ActiveBoost[]> => {
      if (!user?.id) return [];
      const { data, error } = await db
        .from('user_active_boosts' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('consumed', false);
      if (error) {
        if (import.meta.env.DEV) {
          console.warn('[Boosts] unavailable:', error.message || error.code);
        }
        return [];
      }

      const now = Date.now();
      return ((data ?? []) as unknown as ActiveBoost[]).filter(
        (b) =>
          (b.expires_at == null || new Date(b.expires_at).getTime() > now) &&
          (b.uses_remaining == null || b.uses_remaining > 0)
      );
    },
    enabled: !!user?.id,
    staleTime: 15_000,
    refetchInterval: 30_000, // refresh so timers update
  });
}

export function useHasBoost(type: BoostType): boolean {
  const { data = [] } = useActiveBoosts();
  return data.some((b) => b.boost_type === type);
}

export function useActivateBoost() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ itemId, name }: { itemId: string; name: string }) => {
      const { data, error } = await db.rpc('activate_user_boost' as any, {
        p_item_id: itemId,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) throw new Error(result?.error || 'Could not activate');
      return { ...result, name };
    },
    onSuccess: (data) => {
      triggerHaptic('success');
      toast.success(`${data.name} activated!`);
      qc.invalidateQueries({ queryKey: ['active-boosts', user?.id] });
      qc.invalidateQueries({ queryKey: ['marketplace-purchases', user?.id] });
    },
    onError: (err: Error) => {
      triggerHaptic('error');
      toast.error(err.message);
    },
  });
}
