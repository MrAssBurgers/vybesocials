import { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Download, Trash2, Loader2, Clock, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
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

export function AccountDangerZone() {
  const { user, profile, signOut } = useAuth();
  const exportScope = useVerifiedSettingsScope();
  const exportFlight = useRef<symbol | null>(null);
  const downloadUrls = useRef(new Map<string, number>());
  useEffect(() => {
    const clearDownloads = () => { for (const [url, timer] of downloadUrls.current) { window.clearTimeout(timer); URL.revokeObjectURL(url); } downloadUrls.current.clear(); };
    exportFlight.current = null; setExporting(false); clearDownloads();
    return () => { exportFlight.current = null; clearDownloads(); };
  }, [exportScope.account.epoch, exportScope.profileId, exportScope.creationTime]);
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [scheduledPurgeAt, setScheduledPurgeAt] = useState<string | null>(null);

  // Hydrate scheduled deletion from profile (if columns exist)
  useEffect(() => {
    const p = profile as unknown as { scheduled_purge_at?: string | null } | null;
    setScheduledPurgeAt(p?.scheduled_purge_at ?? null);
  }, [profile]);

  const daysRemaining = (() => {
    if (!scheduledPurgeAt) return null;
    const ms = new Date(scheduledPurgeAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
  })();

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
    setRequesting(true);
    try {
      // CF manageAccount expects request_delete (not request_deletion) and returns { ok }.
      const { data, error } = await db.functions.invoke('manage-account', {
        body: { action: 'request_delete' },
      });
      if (error) throw error;
      if (!(data?.ok || data?.success)) throw new Error(data?.error || 'Request failed');

      toast.success('Account scheduled for deletion in 30 days. Sign back in to cancel.');
      setDeleteOpen(false);
      setConfirmText('');
      await signOut();
    } catch (err) {
      console.error('Deletion request error:', err);
      toast.error('Failed to schedule deletion. Please try again.');
    } finally {
      setRequesting(false);
    }
  };

  const handleCancelDeletion = async () => {
    if (!user || cancelling) return;
    setCancelling(true);
    try {
      const { data, error } = await db.functions.invoke('manage-account', {
        body: { action: 'cancel_delete' },
      });
      if (error) throw error;
      if (!(data?.ok || data?.success)) throw new Error(data?.error || 'Cancel failed');
      toast.success('Deletion cancelled. Welcome back!');
      setScheduledPurgeAt(null);
    } catch (err) {
      console.error('Cancel deletion error:', err);
      toast.error('Failed to cancel deletion.');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Danger Zone
      </h3>

      {/* Pending deletion banner */}
      {scheduledPurgeAt && daysRemaining !== null && (
        <div className="p-4 rounded-xl border border-warning/40 bg-warning/10 space-y-3">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">Deletion scheduled</h4>
              <p className="text-xs text-muted-foreground mt-1">
                Your account will be permanently removed in{' '}
                <span className="font-semibold text-foreground">{daysRemaining} day{daysRemaining === 1 ? '' : 's'}</span>.
                Cancel anytime before then to keep your account.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleCancelDeletion}
            disabled={cancelling}
            aria-label="Cancel scheduled account deletion"
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
      {!scheduledPurgeAt && (
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
          <h4 className="text-sm font-medium text-destructive">Delete Account</h4>
          <p className="text-xs text-muted-foreground">
            Schedule your account for deletion. You'll have <span className="font-semibold text-foreground">30 days</span> to
            change your mind — just sign in and cancel.
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
                aria-label="Schedule your account for deletion with a 30-day grace period"
                aria-haspopup="dialog"
                className="mt-2 focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
              >
                <Trash2 className="w-4 h-4 mr-2" aria-hidden="true" />
                Delete Account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="text-destructive">Schedule account deletion?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-2">
                    <span className="block">Your account will be marked for deletion. After 30 days we'll permanently remove:</span>
                    <ul className="list-disc pl-5 space-y-1 text-sm">
                      <li>Your profile and all personal data</li>
                      <li>All posts, comments, and likes</li>
                      <li>All messages and conversations</li>
                      <li>All uploaded media files</li>
                      <li>Badges, challenges, and progress</li>
                    </ul>
                    <span className="block text-foreground mt-3">
                      You can cancel anytime in the next 30 days by signing back in. We recommend exporting your data first.
                    </span>
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
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
                  disabled={confirmText !== 'DELETE' || requesting}
                  aria-busy={requesting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {requesting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : (
                    <Clock className="w-4 h-4 mr-2" aria-hidden="true" />
                  )}
                  {requesting ? 'Scheduling...' : 'Schedule deletion'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
