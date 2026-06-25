import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { clearAutoBugReporterSession } from '@/hooks/useAutoBugReporter';
import { clearErrorTracking } from '@/lib/selfHealingMonitor';
import { toast } from 'sonner';

export interface ClearBugReportsResult {
  cleared: number;
  mode: 'deleted' | 'fixed';
}

/** Mark all unfixed bugs resolved, or delete them — clears admin badges + session noise. */
export async function clearAllBugReports(
  preferDelete = true,
): Promise<ClearBugReportsResult> {
  const toastId = 'fix-all-bugs';
  toast.loading('Clearing bug reports…', { id: toastId });

  let cleared = 0;
  let mode: ClearBugReportsResult['mode'] = preferDelete ? 'deleted' : 'fixed';
  const BATCH = 100;

  for (let pass = 0; pass < 50; pass++) {
    const { data: batch, error: selErr } = await db
      .from('bug_reports')
      .select('id')
      .neq('status', 'fixed')
      .limit(BATCH);

    if (selErr) throw new Error(selErr.message || 'Failed to read bug reports');
    if (!batch?.length) break;

    const ids = batch.map((r: { id: string }) => r.id);

    if (preferDelete) {
      const { error: delErr } = await db.from('bug_reports').delete().in('id', ids);
      if (delErr) {
        mode = 'fixed';
        const { data: updated, error: updErr } = await db
          .from('bug_reports')
          .update({
            status: 'fixed',
            ai_analysis: 'Cleared via Fix All',
            ai_severity: 'low',
          })
          .in('id', ids);
        if (updErr) throw new Error(updErr.message || 'Failed to resolve bug reports');
        cleared += updated?.length ?? ids.length;
      } else {
        cleared += ids.length;
      }
    } else {
      const { data: updated, error: updErr } = await db
        .from('bug_reports')
        .update({
          status: 'fixed',
          ai_analysis: 'Cleared via Fix All',
          ai_severity: 'low',
        })
        .in('id', ids);
      if (updErr) throw new Error(updErr.message || 'Failed to resolve bug reports');
      cleared += updated?.length ?? ids.length;
    }

    toast.loading(`Clearing… ${cleared} done`, { id: toastId });
    if (batch.length < BATCH) break;
  }

  clearAutoBugReporterSession();
  clearErrorTracking();
  toast.dismiss(toastId);

  return { cleared, mode };
}

export async function invalidateBugMonitorQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['admin-bug-reports-inline'] }),
    queryClient.invalidateQueries({ queryKey: ['admin-pending-bugs-count'] }),
    queryClient.invalidateQueries({ queryKey: ['pending-moderation-count'] }),
    queryClient.refetchQueries({ queryKey: ['pending-moderation-count'] }),
    queryClient.refetchQueries({ queryKey: ['admin-pending-bugs-count'] }),
  ]);
}
