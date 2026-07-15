import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ShieldX, MapPin, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { isSelfInitiatedLoginApproval } from '@/lib/sessionIdentity';

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
      if (user && isSelfInitiatedLoginApproval(user.id, row.id, row.metadata)) return;
      if (seenRef.current.has(row.id)) return;
      seenRef.current.add(row.id);
      setPending(row as PendingApproval);
      try {
        toast('New sign-in needs your approval', { duration: 6000 });
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(80);
      } catch { /* noop */ }
    };

    const refresh = async () => {
      const { data } = await db
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

    const onLoginApprovalPush = (event: Event) => {
      const challengeId = (event as CustomEvent<{ challengeId?: string }>).detail?.challengeId;
      if (!challengeId) return;
      void db
        .from('auth_challenges')
        .select('id, metadata, created_at, expires_at, status, challenge_type')
        .eq('id', challengeId)
        .eq('user_id', user.id)
        .eq('challenge_type', 'login_approval')
        .maybeSingle()
        .then(({ data }) => present(data));
    };
    window.addEventListener('vybe:login-approval-push', onLoginApprovalPush);

    const channel = subscribePostgresChannel(`login-approval-${user.id}`, [
      {
        event: 'INSERT',
        table: 'auth_challenges',
        filter: `user_id=eq.${user.id}`,
        callback: (payload) => present(payload.new),
      },
      {
        event: 'UPDATE',
        table: 'auth_challenges',
        filter: `user_id=eq.${user.id}`,
        callback: (payload) => {
          const row = payload.new as any;
          if (row?.status && row.status !== 'pending') {
            setPending((cur) => (cur && cur.id === row.id ? null : cur));
          } else {
            present(row);
          }
        },
      },
    ]);

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
      window.removeEventListener('vybe:login-approval-push', onLoginApprovalPush);
      removeRealtimeChannel(channel);
    };
  }, [authReady, user?.id]);

  const respond = async (intent: 'approve' | 'deny') => {
    if (!pending) return;
    setBusy(true);
    try {
      const { data, error } = await db.functions.invoke('auth-login-approval', {
        body: { action: 'respond', challengeId: pending.id, intent },
      });
      if (error) throw error;
      const payload = data as { error?: string; status?: string } | null;
      if (payload?.error) {
        const msg =
          payload.error === 'expired' ? 'Request expired — sign in again'
          : payload.error === 'already_resolved' ? 'Already handled on another device'
          : 'Could not respond — try again';
        toast.error(msg);
        setPending(null);
        return;
      }
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
  const where =
    [meta.geo?.city, meta.geo?.region, meta.geo?.country].filter(Boolean).join(', ')
    || meta.ip
    || meta.geo?.ip
    || 'Unknown location';
  const ipLine = meta.ip || meta.geo?.ip || null;
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
            A new device is trying to sign in to your VYBE account. Approve only if you recognize this location.
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
          {ipLine && where !== ipLine && (
            <p className="text-xs text-muted-foreground pl-6">IP {ipLine}</p>
          )}
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
