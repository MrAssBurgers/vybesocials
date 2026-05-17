import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldX, MapPin, Smartphone } from 'lucide-react';
import { toast } from 'sonner';

interface PendingApproval {
  id: string;
  metadata: any;
  created_at: string;
  expires_at: string;
}

/**
 * Realtime listener for login-approval requests addressed to the current user.
 * Renders a centered modal (not a bottom sheet) showing IP/city/device of the
 * device trying to sign in, with Approve / Deny buttons that POST to
 * auth-login-approval. Listens to INSERT *and* UPDATE on auth_challenges and
 * re-polls on visibility change so the prompt never requires a manual refresh.
 */
export function LoginApprovalSheet() {
  const { user, authReady } = useAuth();
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [busy, setBusy] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;

    const present = (row: any) => {
      if (cancelled) return;
      if (!row) return;
      if (row.challenge_type !== 'login_approval') return;
      if (row.status !== 'pending') return;
      if (new Date(row.expires_at).getTime() <= Date.now()) return;
      if (seenRef.current.has(row.id)) return;
      seenRef.current.add(row.id);
      setPending(row as PendingApproval);
      try {
        toast('New sign-in needs your approval', { duration: 6000 });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(80);
      } catch { /* noop */ }
    };

    const refresh = async () => {
      const { data } = await supabase
        .from('auth_challenges')
        .select('id, metadata, created_at, expires_at, status, challenge_type')
        .eq('user_id', user.id)
        .eq('challenge_type', 'login_approval')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      present(data);
    };
    refresh();

    const channel = supabase
      .channel(`login-approval-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'auth_challenges',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => present(payload.new))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'auth_challenges',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const row = payload.new as any;
        // If a row we're showing got resolved elsewhere, dismiss it.
        if (row?.status && row.status !== 'pending') {
          setPending((cur) => (cur && cur.id === row.id ? null : cur));
        } else {
          present(row);
        }
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Slower polling safety net for offline gaps.
    const pollId = window.setInterval(refresh, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [authReady, user?.id]);

  const respond = async (intent: 'approve' | 'deny') => {
    if (!pending) return;
    setBusy(true);
    try {
      const { error } = await supabase.functions.invoke('auth-login-approval', {
        body: { action: 'respond', challengeId: pending.id, intent },
      });
      if (error) throw error;
      toast.success(intent === 'approve' ? 'Sign-in approved' : 'Sign-in denied');
      setPending(null);
    } catch {
      toast.error('Could not respond — try again');
    } finally {
      setBusy(false);
    }
  };

  if (!pending) return null;
  const meta = pending.metadata || {};
  const where = [meta.geo?.city, meta.geo?.country].filter(Boolean).join(', ') || meta.ip || 'Unknown location';
  const deviceLabel = meta.device?.label || meta.device?.os || meta.device?.browser || 'Unknown device';

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !busy) setPending(null); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Was this you?
          </DialogTitle>
          <DialogDescription>
            Someone is trying to sign in to your VYBE account.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2.5 p-3 rounded-xl bg-muted/40">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{deviceLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground" />
            <span>{where}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button variant="outline" disabled={busy} onClick={() => respond('deny')}>
            <ShieldX className="w-4 h-4 mr-1.5" /> It wasn't me
          </Button>
          <Button disabled={busy} onClick={() => respond('approve')}>
            <ShieldCheck className="w-4 h-4 mr-1.5" /> Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
