import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useReports } from '@/hooks/useModeration';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Flag, Eye, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { inspectSafetyReport, isReportSessionError, performReportAction, reportAccountGuard, type ReportStatus } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

const safeText = (value: unknown, limit = 1000) => typeof value === 'string' ? value.slice(0, limit) : '';
const dateLabel = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? formatDistanceToNow(new Date(value), { addSuffix: true }) : 'Date unavailable';
const targetLabel = (type: string | null) => ({ profile: 'Account', post: 'Post', comment: 'Comment', mini_app: 'Mini app', message: 'Message' })[type || ''] || 'Unknown target';

export function AdminReportsSection() {
  const { user } = useAuth();
  const session = useReportAccountSession();
  // Private source, notes and confirmation state never cross sessions.
  return <ReportsForSession key={user?.id + ':' + session.epoch} uid={user?.id} epoch={session.epoch} />;
}

function ReportsForSession({ uid, epoch }: { uid?: string; epoch: number }) {
  const [cursor, setCursor] = useState<string | undefined>();
  const [status, setStatus] = useState<Exclude<ReportStatus, 'unknown'> | ''>('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirmation, setConfirmation] = useState<{ kind: 'remove' | 'release'; revision: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accountGuard = useMemo(() => reportAccountGuard(uid || ''), [uid, epoch]);
  const guard = () => { accountGuard(); if (!mounted.current) throw Object.assign(new Error('This review is no longer open.'), { code: 'account-changed' }); };
  const queryClient = useQueryClient();
  const reports = useReports({ cursor, ...(status ? { status } : {}) });
  const inspection = useQuery({ queryKey: ['report-inspection', uid, epoch, selected], queryFn: () => inspectSafetyReport(selected!, guard), enabled: !!uid && !!selected, gcTime: 0, retry: false });
  const deletions = useQuery({
    queryKey: ['post-deletion-log', uid, epoch], enabled: !!uid, gcTime: 0, retry: false,
    queryFn: async () => {
      guard();
      const { data, error } = await db.from('post_deletion_log').select('*').order('created_at', { ascending: false }).limit(100);
      guard(); if (error) throw error;
      return Array.isArray(data) ? data.filter(row => row && typeof row === 'object').slice(0, 100) : [];
    },
  });
  const inspected = inspection.data;
  const refreshReports = () => {
    try { guard(); } catch { return; }
    void reports.refetch();
    // Refresh only this account's report count, leaving an in-flight count alone.
    void queryClient.invalidateQueries({ queryKey: ['pending-moderation-count', uid], predicate: query => query.queryKey.at(-1) === 'reports' && query.state.fetchStatus !== 'fetching' });
  };
  const open = (id: string) => { setSelected(id); setNote(''); setConfirmation(null); setActionError(''); };
  const act = async (action: 'reviewed' | 'dismissed' | 'remove' | 'release') => {
    if (!selected || !inspected || busy) return;
    setBusy(true); setActionError('');
    try {
      guard();
      if (action === 'remove') {
        if (!inspected.target.available || !inspected.target.source || confirmation?.kind !== 'remove' || !note.trim()) throw new Error('Inspect the current app and add a reason before removing it.');
        await performReportAction({ action: 'removeMiniApp', reportId: selected, expectedRevision: confirmation.revision, note: note.trim() }, guard);
      } else if (action === 'release') {
        if (!inspected.hold?.active || confirmation?.kind !== 'release' || !inspected.target.id || !note.trim()) throw new Error('Refresh this hold and add a reason before releasing it.');
        await performReportAction({ action: 'releaseMiniApp', appId: inspected.target.id, expectedHoldRevision: confirmation.revision, note: note.trim() }, guard);
      } else {
        await performReportAction({ action: 'review', reportId: selected, status: action, ...(note.trim() ? { note: note.trim() } : {}) }, guard);
      }
      guard(); setConfirmation(null);
      toast.success(action === 'remove' ? 'Removal recorded. Refreshing the current app status.' : action === 'release' ? 'Release recorded. Refreshing the current hold.' : action === 'reviewed' ? 'Review recorded. This action did not remove content.' : 'Dismissal recorded. This action did not remove content.');
      void queryClient.invalidateQueries({ queryKey: ['admin-reports', uid, epoch] });
      void queryClient.invalidateQueries({ queryKey: ['pending-moderation-count', uid, epoch] });
      void queryClient.invalidateQueries({ queryKey: ['report-inspection', uid, epoch, selected] });
    } catch (error) {
      if (!isReportSessionError(error) && mounted.current) setActionError(error instanceof Error ? error.message : 'The action was not confirmed. Please try again.');
    } finally { if (mounted.current) setBusy(false); }
  };

  return <div className="space-y-4">
    <Card className="liquid-glass rounded-3xl border-white/10 overflow-hidden">
      <CardHeader><CardTitle className="flex items-center gap-2"><Flag className="h-5 w-5 text-primary" />User reports</CardTitle><CardDescription>Inspect the available evidence before deciding what to do. Older reports are marked unverified.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><label className="text-sm">Show <select aria-label="Report status" className="ml-2 rounded-lg border bg-background p-2" value={status} onChange={event => { setStatus(event.target.value as typeof status); setCursor(undefined); }}><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="dismissed">Dismissed</option><option value="actioned">Action taken</option><option value="">All statuses</option></select></label><Button variant="ghost" onClick={refreshReports} disabled={reports.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Refresh reports</Button></div>
        {reports.isPending ? <p role="status">Loading reports…</p> : reports.isError ? <div role="alert"><p>Reports could not be loaded. This does not mean the queue is empty.</p><Button className="mt-2" variant="outline" onClick={refreshReports}>Try again</Button></div> : !reports.data?.length ? <p className="py-6 text-muted-foreground">No reports on this page.</p> : <div className="space-y-3">{reports.data.map(report => <article key={report.id} className="space-y-3 rounded-2xl border border-border bg-card/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{targetLabel(report.targetType)} report</h3><div className="flex flex-wrap gap-2"><Badge variant={report.status === 'pending' ? 'destructive' : 'secondary'}>{report.status === 'unknown' ? 'Status unavailable' : report.status === 'actioned' ? 'Action taken' : report.status}</Badge><Badge variant="outline">{report.verification === 'verified' ? 'Verified submission' : 'Older report · unverified'}</Badge></div></div>
          <p className="break-words text-sm">{report.reason}</p>{report.details && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{report.details}</p>}<p className="text-xs text-muted-foreground">{dateLabel(report.createdAt)}</p>
          <Button variant="outline" size="sm" onClick={() => open(report.id)}><Eye className="mr-2 h-4 w-4" />Inspect report</Button>
        </article>)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"><p className="text-xs text-muted-foreground">Up to 25 reports per page, ordered by report ID.</p><div className="flex gap-2"><Button variant="ghost" disabled={!cursor || reports.isFetching} onClick={() => setCursor(undefined)}>First page</Button><Button variant="outline" disabled={!reports.nextCursor || reports.isFetching || reports.isError} onClick={() => setCursor(reports.nextCursor || undefined)}>Next page</Button></div></div>
      </CardContent>
    </Card>

    <Dialog open={!!selected} onOpenChange={next => { if (!next && !busy) { setSelected(null); setConfirmation(null); setNote(''); setActionError(''); } }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader><DialogTitle>Inspect report</DialogTitle><DialogDescription>Review the available evidence. Marking a report reviewed or dismissed does not remove content.</DialogDescription></DialogHeader>
        {inspection.isPending ? <p role="status">Loading current content…</p> : inspection.isError ? <div role="alert"><p>Current content could not be loaded. No action was taken.</p><Button className="mt-3" onClick={() => void inspection.refetch()} variant="outline">Retry inspection</Button></div> : inspected && <div className="space-y-4">
          <Badge variant="outline">{inspected.report.verification === 'verified' ? 'Verified submission' : 'Older report · identity and target were not verified at submission'}</Badge>
          <h3 className="font-semibold break-words">{inspected.target.title || targetLabel(inspected.target.type)}</h3>
          {inspected.target.caption && <p className="whitespace-pre-wrap break-words text-sm">{inspected.target.caption}</p>}
          {!inspected.target.available && <p className="rounded-xl border p-3 text-sm">{inspected.target.type === 'message' ? 'No verified message snapshot is available. This view does not load messages from the conversation.' : 'The reported content is no longer available for inspection.'}</p>}
          {inspected.target.messageEvidence && <section aria-label="Reported message snapshot" className="space-y-3 rounded-xl border p-4">
            <h3 className="font-semibold">Message captured when reported</h3>
            <p className="text-sm text-muted-foreground">This is a saved copy from when the report was submitted, not the current conversation.</p>
            <p className="text-xs text-muted-foreground">Captured <time dateTime={inspected.target.messageEvidence.capturedAt}>{new Date(inspected.target.messageEvidence.capturedAt).toLocaleString()}</time></p>
            <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-sm">{inspected.target.messageEvidence.content || 'No message text was available.'}</div>
            {inspected.target.messageEvidence.contentTruncated && <p className="text-xs text-muted-foreground">Only the first 8,000 characters were retained in this snapshot.</p>}
            <p className="text-sm text-muted-foreground">{inspected.target.messageEvidence.hasMedia ? `Attachment present${inspected.target.messageEvidence.mediaType ? ` (${inspected.target.messageEvidence.mediaType})` : ''}. Media files are not included or loaded.` : 'No attachment was recorded.'}</p>
          </section>}
          {inspected.target.source && <section aria-label="Mini app source" className="space-y-3"><p className="text-sm text-muted-foreground">Code is shown as text. This review does not run the app or load its external services.</p><p className="text-sm whitespace-pre-wrap break-words">{inspected.target.source.description}</p>{(['html', 'css', 'javascript'] as const).map(language => <details key={language} open className="rounded-xl border p-3"><summary className="cursor-pointer font-semibold">{language === 'html' ? 'HTML' : language === 'css' ? 'CSS' : 'JavaScript'}</summary><pre tabIndex={0} className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 text-xs"><code>{inspected.target.source![language] || '(empty)'}</code></pre></details>)}</section>}
          {inspected.hold?.active && <div className="rounded-xl border border-destructive/40 p-3 text-sm"><p className="font-semibold">Publishing is on hold</p><p className="whitespace-pre-wrap break-words">{inspected.hold.note}</p><p className="mt-2 text-muted-foreground">Releasing the hold does not publish the app. The creator must publish it again.</p></div>}
          <label className="block space-y-2 text-sm"><span>Review note {confirmation ? '(required)' : '(optional)'}</span><Textarea aria-label="Review note" value={note} maxLength={1000} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Explain the decision for the review record." /></label>
          {actionError && <div role="alert" className="rounded-xl border border-destructive/40 p-3 text-sm"><p>{actionError}</p><Button className="mt-2" size="sm" variant="outline" disabled={busy || inspection.isFetching} onClick={() => { setConfirmation(null); void inspection.refetch(); }}>Refresh current content</Button></div>}
          {confirmation ? <div className="space-y-3 rounded-xl border border-destructive/40 p-4"><h3 className="font-semibold">{confirmation.kind === 'remove' ? 'Remove this published mini app?' : 'Release the publishing hold?'}</h3><p className="text-sm text-muted-foreground">{confirmation.kind === 'remove' ? 'This removes the inspected version from the Hub and prevents republishing until the hold is released. The creator’s private draft is kept.' : 'The app stays unpublished. The creator can choose to publish a new version after this hold is released.'}</p><div className="flex flex-wrap gap-2"><Button variant="destructive" disabled={busy || !note.trim() || inspection.isFetching} onClick={() => void act(confirmation.kind)}>{busy ? 'Saving…' : confirmation.kind === 'remove' ? 'Confirm removal' : 'Confirm release'}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button></div></div> : <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || inspection.isFetching || inspected.report.status === 'actioned'} onClick={() => void act('reviewed')}>Mark reviewed</Button><Button variant="ghost" disabled={busy || inspection.isFetching || inspected.report.status === 'actioned'} onClick={() => void act('dismissed')}>Dismiss report</Button>{inspected.target.type === 'mini_app' && inspected.target.available && inspected.target.source && inspected.target.revision && !inspected.hold?.active && <Button variant="destructive" disabled={busy || inspection.isFetching} onClick={() => setConfirmation({ kind: 'remove', revision: inspected.target.revision! })}>Remove mini app</Button>}{inspected.target.type === 'mini_app' && inspected.hold?.active && inspected.hold.revision && <Button variant="outline" disabled={busy || inspection.isFetching} onClick={() => setConfirmation({ kind: 'release', revision: inspected.hold!.revision! })}>Release hold</Button>}</div>}
        </div>}
      </DialogContent>
    </Dialog>

    <Card className="rounded-3xl"><CardHeader><CardTitle className="text-lg">Post deletion history</CardTitle><CardDescription>Latest 100 recorded deletions. This separate history does not verify older report submissions.</CardDescription></CardHeader><CardContent>
      {deletions.isPending ? <p role="status">Loading deletion history…</p> : deletions.isError ? <div role="alert"><p>Deletion history could not be loaded.</p><Button variant="outline" onClick={() => void deletions.refetch()}>Retry history</Button></div> : !deletions.data?.length ? <p className="text-sm text-muted-foreground">No deletions recorded.</p> : <div className="max-h-96 overflow-y-auto space-y-2">{deletions.data.map((entry, index) => <div key={safeText(entry.id, 200) || index} className="rounded-xl border p-3 text-sm"><p className="break-words">{safeText(entry.caption) || 'Post deleted'}</p><p className="text-xs text-muted-foreground">{dateLabel(entry.created_at)}</p>{typeof entry.reason === 'string' && <p className="break-words text-muted-foreground">{safeText(entry.reason)}</p>}</div>)}</div>}
    </CardContent></Card>
  </div>;
}
