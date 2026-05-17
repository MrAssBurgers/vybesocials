import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
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
 * Pops a bottom sheet showing IP/city/device of the device trying to sign in,
 * with Approve / Deny buttons that POST to auth-login-approval.
 *
 * The Settings → Security toggle "Login Approvals" controls whether the
 * server creates these challenges in the first place.
 */
export function LoginApprovalSheet() {
  const { user, authReady } = useAuth();
  const [pending, setPending] = useState<PendingApproval | null>(null);
  const [busy, setBusy] = useState(false);
  const seenRef = useRef<Set<string>>(new Set());

  // Check for any already-pending approvals at mount, then subscribe.
  useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;

    const refresh = async () => {
      const { data } = await supabase
        .from('auth_challenges')
        .select('id, metadata, created_at, expires_at, status')
        .eq('user_id', user.id)
        .eq('challenge_type', 'login_approval')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (data && new Date(data.expires_at).getTime() > Date.now() && !seenRef.current.has(data.id)) {
        setPending(data as PendingApproval);
        seenRef.current.add(data.id);
      }
    };
    refresh();

    const channel = supabase
      .channel(`login-approval-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'auth_challenges',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        const row = payload.new as any;
        if (row?.challenge_type !== 'login_approval' || row?.status !== 'pending') return;
        if (seenRef.current.has(row.id)) return;
        seenRef.current.add(row.id);
        setPending(row as PendingApproval);
        toast('New sign-in needs your approval', { duration: 6000 });
      })
      .subscribe();

    // Realtime can drop INSERT events on flaky networks. Re-poll every 8s as
    // a safety net so an approval prompt is never permanently missed.
    const pollId = window.setInterval(refresh, 8000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
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

  return (
    <Sheet open onOpenChange={(v) => { if (!v) setPending(null); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle>Was this you?</SheetTitle>
          <SheetDescription>Someone is trying to sign in to your VYBE account.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-2.5 p-3 rounded-xl bg-muted/40">
          <div className="flex items-center gap-2 text-sm">
            <Smartphone className="w-4 h-4 text-muted-foreground" />
            <span className="font-medium">{meta.device || 'Unknown device'}</span>
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
      </SheetContent>
    </Sheet>
  );
}
