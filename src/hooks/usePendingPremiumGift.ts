import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { pendingPremiumGift } from '@/lib/premiumGiftService';
import { useReportAccountSession } from './useReportAccountSession';

export function usePendingPremiumGift() {
  const { user } = useAuth();
  const session = useReportAccountSession();

  return useQuery({
    queryKey: ['pending-premium-gift', user?.id, session.epoch],
    queryFn: async () => {
      if (!user?.id) return null;

      return pendingPremiumGift(user.id);
    },
    enabled: !!user?.id && session.uid === user.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
