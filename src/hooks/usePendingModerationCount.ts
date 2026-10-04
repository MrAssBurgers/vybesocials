import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useUserRole } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { getPendingReportCount, reportAccountGuard } from '@/lib/reportModerationService';
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
      const [reports, flags, appeals, bugs] = await Promise.all([
        getPendingReportCount(guard),
        db.from('content_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('content_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      guard();
      if (flags.error || appeals.error || bugs.error) throw new Error('The moderation count is unavailable.');
      const total =
        reports + (flags.count || 0) + (appeals.count || 0) + (bugs.count || 0);
      return total;
    },
    enabled: isStaff && !!user?.id && session.uid === user.id,
    gcTime: 0, retry: false,
    staleTime: 60_000,
    refetchInterval: isStaff ? 60_000 : false,
  });
}
