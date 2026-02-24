import { useState } from 'react';
import { AlertTriangle, Download, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
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

export function AccountDangerZone() {
  const { user, signOut } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-account', {
        body: { action: 'export' },
      });

      if (error) throw error;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vybe-data-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully!');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export data. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!user || confirmText !== 'DELETE') return;
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('manage-account', {
        body: { action: 'delete' },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Deletion failed');

      toast.success('Account deleted. Goodbye! 👋');
      await signOut();
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Failed to delete account. Please contact support.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        Danger Zone
      </h3>

      {/* Data Export */}
      <div className="p-4 rounded-xl border border-border bg-card space-y-2">
        <h4 className="text-sm font-medium text-foreground">Export Your Data</h4>
        <p className="text-xs text-muted-foreground">
          Download a copy of all your data including profile, posts, messages, and activity.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
          className="mt-2"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {exporting ? 'Exporting...' : 'Export Data'}
        </Button>
      </div>

      {/* Account Deletion */}
      <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 space-y-2">
        <h4 className="text-sm font-medium text-destructive">Delete Account</h4>
        <p className="text-xs text-muted-foreground">
          Permanently delete your account and all associated data. This action cannot be undone.
        </p>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" className="mt-2">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Account
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-destructive">Delete your account?</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <span className="block">This will permanently delete:</span>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li>Your profile and all personal data</li>
                  <li>All posts, comments, and likes</li>
                  <li>All messages and conversations</li>
                  <li>All uploaded media files</li>
                  <li>Badges, challenges, and progress</li>
                </ul>
                <span className="block font-medium text-destructive mt-3">
                  This action is irreversible. We recommend exporting your data first.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-2">
              <p className="text-sm text-muted-foreground mb-2">
                Type <span className="font-mono font-bold text-foreground">DELETE</span> to confirm:
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type DELETE"
                className="font-mono"
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={confirmText !== 'DELETE' || deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4 mr-2" />
                )}
                {deleting ? 'Deleting...' : 'Delete Forever'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
