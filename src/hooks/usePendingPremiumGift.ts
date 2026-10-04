import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { pendingPremiumGift } from '@/lib/premiumGiftService';

export function usePendingPremiumGift() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-premium-gift', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      return pendingPremiumGift(user.id);
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
