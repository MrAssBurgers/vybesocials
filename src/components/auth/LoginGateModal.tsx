import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Mail, ShieldCheck, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type Mode = 'code' | 'approval';

interface Props {
  open: boolean;
  mode: Mode;
  email: string;
  challengeId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * Blocking login gate. Used in two flows:
 * - mode="code": email 2FA. User pastes 6-digit code; we verify and resolve.
 * - mode="approval": Instagram-style trusted-device approval. We poll until
 *   the trusted device approves (or denies / times out) and then resolve.
 */
export function LoginGateModal({ open, mode, email, challengeId, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const pollTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  // Resend-code cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // Recursive setTimeout polling (so iOS PWA / Despia can pause+resume cleanly).
  useEffect(() => {
    if (!open || mode !== 'approval') return;
    cancelledRef.current = false;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const { data, error } = await supabase.functions.invoke('auth-login-approval', {
          body: { action: 'poll', challengeId },
        });
        if (cancelledRef.current) return;
        if (!error) {
          const status = (data as any)?.status;
          if (status === 'approved') {
            toast.success('Approved on your trusted device');
            onSuccess();
            return;
          }
          if (status === 'denied') {
            toast.error('Sign-in was denied');
            onCancel();
            return;
          }
          if (status === 'expired' || status === 'not_found') {
            toast.error('Approval request expired');
            onCancel();
            return;
          }
        }
      } catch {}
      // Re-arm only if still visible — backgrounded tabs resume via visibilitychange.
      if (document.visibilityState === 'visible') {
        pollTimerRef.current = window.setTimeout(tick, 3000);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
        tick();
      }
    };

    tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [open, mode, challengeId, onSuccess, onCancel]);

  const verifyCode = async () => {
    const cleaned = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-2fa-verify', {
        body: { challengeId, code: cleaned },
      });
      if (error || (data as any)?.error) {
        toast.error('Invalid or expired code');
        return;
      }
      onSuccess();
    } finally {
      setBusy(false);
    }
  };

  const resendCode = async () => {
    if (resendCooldown > 0 || busy) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke('auth-2fa-request', {
        body: { email },
      });
      if (error || (data as any)?.error) {
        toast.error('Could not resend code');
        return;
      }
      toast.success('New code sent');
      setResendCooldown(30);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'code' ? <Mail className="w-5 h-5 text-primary" /> : <Smartphone className="w-5 h-5 text-primary" />}
            {mode === 'code' ? 'Verify your email' : 'Approval needed'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'code'
              ? `We sent a 6-digit code to ${email}. Enter it to finish signing in.`
              : 'Open VYBE on a trusted device to approve this sign-in. We\'ll continue automatically.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'code' ? (
          <div className="space-y-3">
            <Input
              autoFocus
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => { if (e.key === 'Enter') verifyCode(); }}
              className="text-center tracking-[0.5em] text-lg font-mono"
            />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || resendCooldown > 0}
                onClick={resendCode}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
                <Button disabled={busy || code.length !== 6} onClick={verifyCode}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><ShieldCheck className="w-4 h-4 mr-1.5" /> Verify</>}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
            <Button variant="ghost" className="w-full" onClick={onCancel}>Cancel</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
