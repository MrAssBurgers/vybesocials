import { useQuery } from '@tanstack/react-query';
import { useUserRole } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

/**
 * Returns total count of pending moderation items (reports, flags, appeals, bug reports)
 * for use as a notification badge on the admin panel link.
 * Staff-only — regular users do not have read access to these collections.
 */
export function usePendingModerationCount() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  const guard = reportAccountGuard(user?.id || '');
  const { data: userRole } = useUserRole();
  const isStaff =
    userRole === 'owner' || userRole === 'admin' || userRole === 'moderator';

  return useQuery({
    queryKey: ['pending-moderation-count', user?.id, session.epoch, userRole],
    queryFn: async () => {
      guard();
      const { getPendingModerationCount } = await import('@/lib/moderationSummaryService');
      const total = await getPendingModerationCount(guard);
      guard();
      return total;
    },
    enabled: isStaff && !!user?.id && session.uid === user.id,
    gcTime: 0, retry: false,
    staleTime: 60_000,
    refetchInterval: isStaff ? 60_000 : false,
  });
}
