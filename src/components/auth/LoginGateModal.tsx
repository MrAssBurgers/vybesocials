import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ShieldCheck, Smartphone, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';

type Mode = 'code' | 'approval';

interface SessionTokens { access_token: string; refresh_token: string }

interface Props {
  open: boolean;
  mode: Mode;
  email: string;
  challengeId: string;
  /** ISO timestamp the challenge expires — drives the countdown. */
  expiresAt?: string;
  /** Approval-mode metadata to display "is this you?" context. */
  approvalDevice?: string;
  approvalLocation?: { city?: string | null; country?: string | null; ip?: string | null };
  onSuccess: (session: SessionTokens | null) => void;
  onCancel: () => void;
}

/**
 * Blocking 2FA / login-approval gate. Used in two flows:
 * - mode="code": email 2FA. User types the 6-digit code; we verify and on
 *   success we receive a Supabase session and apply it via setSession.
 * - mode="approval": Instagram-style trusted-device approval. We poll until
 *   the trusted device approves; the approval response carries the session.
 *
 * No Supabase session exists on the device while this modal is open — the
 * preauth function holds the tokens server-side. Cancelling is therefore
 * naturally safe and does NOT need to call signOut().
 */
export function LoginGateModal({
  open, mode, email, challengeId, expiresAt,
  approvalDevice, approvalLocation,
  onSuccess, onCancel,
}: Props) {
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const pollTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const submittedRef = useRef(false);

  const code = digits.join('');

  // ── Expiry countdown ─────────────────────────────────────
  useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return; }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // Auto-focus first cell when the modal opens
  useEffect(() => {
    if (open && mode === 'code') {
      const t = window.setTimeout(() => inputsRef.current[0]?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open, mode]);

  // ── Approval polling (recursive setTimeout — survives iOS PWA pause) ──
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
            const session = (data as any)?.session ?? null;
            onSuccess(session);
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

  // ── Verify code ──────────────────────────────────────────
  const verifyCode = useCallback(async (codeStr: string) => {
    if (busy || submittedRef.current) return;
    if (!/^\d{6}$/.test(codeStr)) return;
    submittedRef.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('auth-2fa-verify', {
        body: { challengeId, code: codeStr },
      });
      if (error || (data as any)?.error) {
        toast.error('Invalid or expired code');
        setDigits(['', '', '', '', '', '']);
        inputsRef.current[0]?.focus();
        submittedRef.current = false;
        return;
      }
      const session = (data as any)?.session ?? null;
      onSuccess(session);
    } finally {
      setBusy(false);
    }
  }, [busy, challengeId, onSuccess]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if (mode === 'code' && code.length === 6 && /^\d{6}$/.test(code)) {
      verifyCode(code);
    }
  }, [code, mode, verifyCode]);

  const handleDigit = (i: number, raw: string) => {
    const v = raw.replace(/\D/g, '');
    if (!v) {
      // Backspace clearing
      const next = [...digits];
      next[i] = '';
      setDigits(next);
      return;
    }
    // Pasting full code into one cell — distribute
    if (v.length > 1) {
      const next = [...digits];
      const chars = v.slice(0, 6 - i).split('');
      chars.forEach((c, j) => { next[i + j] = c; });
      setDigits(next);
      const last = Math.min(i + chars.length, 5);
      inputsRef.current[last]?.focus();
      return;
    }
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (i < 5) inputsRef.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      inputsRef.current[i - 1]?.focus();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      inputsRef.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      inputsRef.current[i + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      e.preventDefault();
      setDigits(pasted.split(''));
      inputsRef.current[5]?.focus();
    }
  };

  const resendCode = async () => {
    if (resendCooldown > 0 || busy) return;
    try {
      setBusy(true);
      const { data, error } = await supabase.functions.invoke('auth-2fa-request', {
        body: { email },
      });
      if (error || (data as any)?.ok === false || (data as any)?.error) {
        toast.error("Couldn't send a new code. Try again in a moment.");
        return;
      }
      toast.success('New code sent');
      setResendCooldown(30);
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
      submittedRef.current = false;
    } finally {
      setBusy(false);
    }
  };

  const denySelf = async () => {
    try {
      setBusy(true);
      await supabase.functions.invoke('auth-login-approval', {
        body: { action: 'deny_self', challengeId },
      });
      toast.success('Sign-in denied. Change your password if this wasn\'t you.');
    } catch {}
    finally {
      setBusy(false);
      onCancel();
    }
  };

  const expiryLabel = useMemo(() => {
    if (secondsLeft == null) return null;
    if (secondsLeft <= 0) return 'expired';
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, [secondsLeft]);

  // Lock dismissal while a verify/poll is in flight or while we're handling a
  // submission, so users can't accidentally drop the gate by tapping outside.
  const lockDismiss = busy;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v && !lockDismiss) onCancel(); }}
    >
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => { if (lockDismiss) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (lockDismiss) e.preventDefault(); }}
        onInteractOutside={(e) => { if (lockDismiss) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'code'
              ? <Mail className="w-5 h-5 text-primary" />
              : <Smartphone className="w-5 h-5 text-primary" />}
            {mode === 'code' ? 'Enter your code' : 'Approve sign-in'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'code'
              ? <>We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. It expires {expiryLabel ? <>in <span className="font-mono">{expiryLabel}</span></> : 'soon'}.</>
              : <>Open VYBE on a trusted device and tap <span className="font-medium text-foreground">Approve</span>. We&apos;ll continue automatically.</>}
          </DialogDescription>
        </DialogHeader>

        {mode === 'code' ? (
          <div className="space-y-4">
            <div className="flex gap-2 justify-center pt-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputsRef.current[i] = el)}
                  type="text"
                  inputMode="numeric"
                  autoComplete={i === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={d}
                  disabled={busy}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-11 h-14 text-center text-xl font-semibold rounded-xl bg-muted border border-border focus:border-primary focus:ring-2 focus:ring-primary/30 outline-none transition-colors disabled:opacity-50"
                />
              ))}
            </div>

            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Verifying…
              </motion.div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || resendCooldown > 0}
                onClick={resendCode}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={busy} onClick={onCancel}>
                  Use a different account
                </Button>
                <Button
                  disabled={busy || code.length !== 6}
                  onClick={() => verifyCode(code)}
                >
                  {busy
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ShieldCheck className="w-4 h-4 mr-1.5" /> Verify</>}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full bg-primary/30"
                  animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeOut' }}
                />
                <div className="relative w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center">
                  <Smartphone className="w-7 h-7 text-primary" />
                </div>
              </div>
              <div className="text-center text-sm text-muted-foreground space-y-1">
                {approvalDevice && <div className="text-foreground font-medium">{approvalDevice}</div>}
                {(approvalLocation?.city || approvalLocation?.country) && (
                  <div>
                    {approvalLocation?.city ? `${approvalLocation.city}, ` : ''}
                    {approvalLocation?.country ?? ''}
                  </div>
                )}
                {approvalLocation?.ip && <div className="font-mono text-xs">{approvalLocation.ip}</div>}
                {expiryLabel && <div>Expires in <span className="font-mono">{expiryLabel}</span></div>}
              </div>
            </div>

            <Button
              variant="destructive"
              className="w-full"
              disabled={busy}
              onClick={denySelf}
            >
              <ShieldAlert className="w-4 h-4 mr-1.5" /> This wasn&apos;t me
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
