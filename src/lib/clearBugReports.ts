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
  const READ_WINDOW = 500;
  const BATCH = 100;

  for (let pass = 0; pass < 50; pass++) {
    // Select WITHOUT a status filter: Firestore `!=` queries skip documents
    // that are missing the field entirely (legacy auto-reported bugs), which
    // made Fix All report "already cleared" while bugs stayed visible.
    // Read a wide window so already-fixed rows can't crowd out unfixed ones.
    const { data: batch, error: selErr } = await db
      .from('bug_reports')
      .select('id, status')
      .limit(READ_WINDOW);

    if (selErr) throw new Error(selErr.message || 'Failed to read bug reports');
    const unfixed = (batch || []).filter(
      (r: { id: string; status?: string }) => r.status !== 'fixed',
    );
    if (!unfixed.length) break;

    const ids = unfixed.slice(0, BATCH).map((r: { id: string }) => r.id);

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
            resolved_at: new Date().toISOString(),
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
          resolved_at: new Date().toISOString(),
        })
        .in('id', ids);
      if (updErr) throw new Error(updErr.message || 'Failed to resolve bug reports');
      cleared += updated?.length ?? ids.length;
    }

    toast.loading(`Clearing… ${cleared} done`, { id: toastId });
    if (unfixed.length <= BATCH && (batch || []).length < READ_WINDOW) break;
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
