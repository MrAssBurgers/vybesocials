import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useUserRole } from '@/hooks/useModeration';

/**
 * Returns total count of pending moderation items (reports, flags, appeals, bug reports)
 * for use as a notification badge on the admin panel link.
 * Staff-only — regular users do not have read access to these collections.
 */
export function usePendingModerationCount() {
  const { data: userRole } = useUserRole();
  const isStaff =
    userRole === 'owner' || userRole === 'admin' || userRole === 'moderator';

  return useQuery({
    queryKey: ['pending-moderation-count', userRole],
    queryFn: async () => {
      const [reports, flags, appeals, bugs] = await Promise.all([
        db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('content_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('content_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);

      // Soft-fail if rules/role lag — never surface as a red console error for the badge.
      const total =
        (reports.error ? 0 : reports.count || 0) +
        (flags.error ? 0 : flags.count || 0) +
        (appeals.error ? 0 : appeals.count || 0) +
        (bugs.error ? 0 : bugs.count || 0);
      return total;
    },
    enabled: isStaff,
    staleTime: 60_000,
    refetchInterval: isStaff ? 60_000 : false,
  });
}
