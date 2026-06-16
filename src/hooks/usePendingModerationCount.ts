import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

/**
 * Returns total count of pending moderation items (reports, flags, appeals, bug reports)
 * for use as a notification badge on the admin panel link.
 */
export function usePendingModerationCount() {
  return useQuery({
    queryKey: ['pending-moderation-count'],
    queryFn: async () => {
      const [reports, flags, appeals, bugs] = await Promise.all([
        db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('content_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('content_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      return (reports.count || 0) + (flags.count || 0) + (appeals.count || 0) + (bugs.count || 0);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
