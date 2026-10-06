import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Download, Trash2, Loader2, Clock, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { useVerifiedSettingsScope } from '@/hooks/useVerifiedSettingsScope';
import { useAccountDeletion } from '@/hooks/useAccountDeletion';

export function AccountDangerZone() {
  const { user } = useAuth();
  const deletion = useAccountDeletion();
  const exportScope = useVerifiedSettingsScope();
  const exportFlight = useRef<symbol | null>(null);
  const deletionView = useRef<symbol | null>(null);
  const downloadUrls = useRef(new Map<string, number>());
  useEffect(() => {
    const clearDownloads = () => { for (const [url, timer] of downloadUrls.current) { window.clearTimeout(timer); URL.revokeObjectURL(url); } downloadUrls.current.clear(); };
    deletionView.current = Symbol('deletion-view'); setDeleteOpen(false); setConfirmText('');
    exportFlight.current = null; setExporting(false); clearDownloads();
    return () => { deletionView.current = null; exportFlight.current = null; clearDownloads(); };
  }, [exportScope.account.epoch, exportScope.profileId, exportScope.creationTime]);
  const [exporting, setExporting] = useState(false);
  const requesting = deletion.busy;
  const cancelling = deletion.busy;
  const [confirmText, setConfirmText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const pendingDeletion = deletion.state?.status === 'pending_review';

  const handleExport = async () => {
    if (!user || exportFlight.current) return;
    let scope: ReturnType<typeof exportScope.capture>;
    try { scope = exportScope.capture(); } catch { toast.error('Load your current profile before exporting.'); return; }
    const flight = Symbol('account-export'); exportFlight.current = flight;
    const guard = () => { scope.guard(); if (exportFlight.current !== flight) throw new Error('Export retired.'); };
    setExporting(true);
    try {
      const { collectAccountDataExport } = await import('@/lib/accountDataExport'); guard();
      const blob = await collectAccountDataExport(scope.fields.expectedOwnerUid, scope.fields.expectedProfileId, guard); guard();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); let started = false;
      try {
        guard(); a.href = url;
        a.download = `vybe-data-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); started = true;
      } finally {
        a.remove();
        if (started) {
          // Give mobile browsers time to consume the Blob URL. Account changes
          // and unmount still revoke it immediately through the effect cleanup.
          const timer = window.setTimeout(() => { URL.revokeObjectURL(url); downloadUrls.current.delete(url); }, 1500);
          downloadUrls.current.set(url, timer);
        } else URL.revokeObjectURL(url);
      }
      guard(); toast.success('Your data export is ready.');
    } catch (error) {
      try { guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'The export failed. No partial download was created. Try again.');
    } finally {
      if (exportFlight.current === flight) { exportFlight.current = null; setExporting(false); }
    }
  };

  const handleRequestDeletion = async () => {
    if (!user || confirmText !== 'DELETE' || requesting) return;
    try {
      const scope=exportScope.capture(), view=deletionView.current;
      await deletion.request();
      scope.guard(); if(!view || deletionView.current!==view)return;
      setDeleteOpen(false);
      setConfirmText('');
    } catch { /* The checked hook renders its error; no stale toast or sign-out. */ }
  };

  const handleCancelDeletion = async () => {
    if (!user || cancelling) return;
    try {
      await deletion.cancel();
    } catch { /* The checked hook renders its error. */ }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Danger Zone
      </h3>

      {/* Pending deletion banner */}
      {pendingDeletion && (
        <div className="p-4 rounded-xl border border-warning/40 bg-warning/10 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Deletion request recorded</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Your request is eligible for review after {new Date(deletion.state!.eligibleAfter!).toLocaleDateString()}.
                Permanent cleanup is not automatic yet. You can cancel this request here.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleCancelDeletion}
            disabled={cancelling}
            aria-label="Cancel account deletion request"
            className="w-full"
          >
            {cancelling ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Undo2 className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            {cancelling ? 'Cancelling...' : 'Cancel deletion'}
          </Button>
        </div>
      )}

      {deletion.loading && <p role="status" className="text-xs text-muted-foreground">Checking deletion status...</p>}
      {deletion.error && <div role="alert" className="text-sm text-destructive space-y-2"><p>{deletion.error}</p><Button variant="outline" size="sm" onClick={deletion.refresh} disabled={deletion.busy}>Retry deletion status</Button></div>}
      {deletion.state?.status === 'cancelled' && <p role="status" className="text-sm text-muted-foreground">Your deletion request is cancelled.</p>}
      {deletion.state && ['review_required','processing','completed'].includes(deletion.state.status) && <p role="status" className="text-sm text-muted-foreground">Your deletion request needs support review. <a href="mailto:vybesocial.info@gmail.com" className="text-primary underline">Contact support</a>.</p>}
      {/* Data Export */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <h4 className="text-sm font-medium text-foreground">Export Your Data</h4>
        <p className="text-xs text-muted-foreground">
          Download your profile, authored posts and messages, and activity as JSON. Media links are included; media files and other people’s messages are not included.
        </p>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={handleExport}
          disabled={exporting || !exportScope.ready}
          aria-label="Export your account data as JSON"
          aria-busy={exporting}
          className="mt-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
          )}
          {exporting ? 'Exporting...' : 'Export Data'}
        </Button>
      </div>

      {/* Account Deletion (only if not already scheduled) */}
      {!pendingDeletion && (!deletion.state || ['none','cancelled'].includes(deletion.state.status)) && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
          <h4 className="text-sm font-medium text-destructive">Delete Account</h4>
          <p className="text-xs text-muted-foreground">
            Request deletion of your account. A 30-day grace period comes before review.
            Permanent cleanup is not automatic yet; contact support to follow up.
          </p>
          <AlertDialog
            open={deleteOpen}
            onOpenChange={(o) => {
              if (requesting) return;
              setDeleteOpen(o);
              if (!o) setConfirmText('');
            }}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                type="button"
                disabled={!deletion.ready}
                aria-label="Request account deletion with a 30-day grace period"
                aria-haspopup="dialog"
                className="mt-2 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
              >
                <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Request account deletion?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <span className="block">This records a request for your current account. It does not delete your profile, posts, messages or media immediately. After a 30-day grace period the request is eligible for review; permanent cleanup is not automatic yet.</span>
                    <span className="block text-foreground mt-3">
                      You can cancel the pending request here. We recommend exporting your data first. No confirmation email is sent by this action.
                    </span>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deletion.error && <div role="alert" className="text-sm text-destructive space-y-2"><p>{deletion.error}</p><Button variant="outline" size="sm" type="button" onClick={deletion.refresh} disabled={deletion.busy}>Refresh deletion status</Button></div>}
              <div className="py-2">
                <label htmlFor="delete-confirm-input" className="text-sm text-muted-foreground mb-2 block">
                  Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm:
                </label>
                <Input
                  id="delete-confirm-input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Type DELETE"
                  autoComplete="off"
                  disabled={requesting}
                  className="font-mono focus-visible:ring-2 focus-visible:ring-destructive"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setConfirmText('')} disabled={requesting}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    handleRequestDeletion();
                  }}
                  disabled={confirmText !== 'DELETE' || requesting || !deletion.ready}
                  aria-busy={requesting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {requesting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Clock className="w-4 h-4 mr-2" aria-hidden="true" />
                  )}
                  {requesting ? 'Submitting...' : 'Request deletion'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
