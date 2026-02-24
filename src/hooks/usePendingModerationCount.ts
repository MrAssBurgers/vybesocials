import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Returns total count of pending moderation items (reports, flags, appeals, bug reports)
 * for use as a notification badge on the admin panel link.
 */
export function usePendingModerationCount() {
  return useQuery({
    queryKey: ['pending-moderation-count'],
    queryFn: async () => {
      const [reports, flags, appeals, bugs] = await Promise.all([
        supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('content_flags').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('content_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bug_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      ]);
      return (reports.count || 0) + (flags.count || 0) + (appeals.count || 0) + (bugs.count || 0);
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}
