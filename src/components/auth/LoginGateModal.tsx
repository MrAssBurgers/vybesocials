import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mail, ShieldCheck, Smartphone, ShieldAlert, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';

type Mode = 'code' | 'approval' | 'options' | 'sms';


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
  const [currentMode, setCurrentMode] = useState<Mode>(mode);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [activeExpiresAt, setActiveExpiresAt] = useState(expiresAt);
  const [activeChallengeId, setActiveChallengeId] = useState(challengeId);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [optionBusy, setOptionBusy] = useState<null | 'email' | 'sms'>(null);
  const [approvalChallengeId, setApprovalChallengeId] = useState(challengeId);

  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const pollTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const submittedRef = useRef(false);

  const code = digits.join('');

  // ── Expiry countdown ─────────────────────────────────────
  useEffect(() => {
    setActiveExpiresAt(expiresAt);
    setActiveChallengeId(challengeId);
    setApprovalChallengeId(challengeId);
    setCurrentMode(mode);
    setCurrentEmail(email);
  }, [expiresAt, challengeId, mode, email]);


  useEffect(() => {
    if (!activeExpiresAt) { setSecondsLeft(null); return; }
    const tick = () => {
      const ms = new Date(activeExpiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [activeExpiresAt]);

  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // Auto-focus first cell when the modal opens
  useEffect(() => {
    if (open && currentMode === 'code') {
      const t = window.setTimeout(() => inputsRef.current[0]?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [open, mode]);

  // ── Approval realtime + polling fallback ─────────────────
  useEffect(() => {
    if (!open || currentMode !== 'approval') return;
    cancelledRef.current = false;

    const finalize = (status: string, session?: any) => {
      if (cancelledRef.current) return;
      cancelledRef.current = true;
      if (status === 'approved') {
        onSuccess(session ?? null);
      } else if (status === 'denied') {
        toast.error('Sign-in was denied');
        onCancel();
      } else if (status === 'expired' || status === 'not_found') {
        toast.error('Approval request expired');
        onCancel();
      }
    };

    const poll = async () => {
      if (cancelledRef.current) return;
      try {
        const { data, error } = await supabase.functions.invoke('auth-login-approval', {
          body: { action: 'poll', challengeId },
        });
        if (cancelledRef.current) return;
        if (!error) {
          const status = (data as any)?.status;
          if (status === 'approved') {
            finalize('approved', (data as any)?.session ?? null);
            return;
          }
          if (status === 'denied' || status === 'expired' || status === 'not_found') {
            finalize(status);
            return;
          }
        }
      } catch {}
      if (document.visibilityState === 'visible' && !cancelledRef.current) {
        pollTimerRef.current = window.setTimeout(poll, 1500);
      }
    };

    // Instant resolution via broadcast from auth-login-approval `respond`.
    // The payload now carries the session directly — no extra poll needed.
    const bc = supabase
      .channel(`login-approval:${challengeId}`)
      .on('broadcast', { event: 'resolved' }, (payload: any) => {
        const status = payload?.payload?.status;
        const session = payload?.payload?.session;
        if (status === 'approved') {
          if (session) finalize('approved', session);
          else poll(); // fallback for older edge function versions
        } else if (status) {
          finalize(status);
        }
      })
      .subscribe();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
        poll();
      }
    };

    poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(bc);
    };
  }, [open, currentMode, challengeId, onSuccess, onCancel]);

  // ── Verify code (email or sms) ───────────────────────────
  const verifyCode = useCallback(async (codeStr: string) => {
    if (busy || submittedRef.current) return;
    if (!/^\d{6}$/.test(codeStr)) return;
    submittedRef.current = true;
    setBusy(true);
    try {
      const fn = currentMode === 'sms' ? 'auth-2fa-verify-phone' : 'auth-2fa-verify';
      const { data, error } = await supabase.functions.invoke(fn, {
        body: { challengeId: activeChallengeId, code: codeStr },
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
  }, [busy, activeChallengeId, onSuccess, currentMode]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if ((currentMode === 'code' || currentMode === 'sms') && code.length === 6 && /^\d{6}$/.test(code)) {
      verifyCode(code);
    }
  }, [code, currentMode, verifyCode]);

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
        body: { email: currentEmail, challengeId: activeChallengeId },
      });
      if (error || (data as any)?.ok === false || (data as any)?.error) {
        toast.error("Couldn't send a new code. Try again in a moment.");
        return;
      }
      if ((data as any)?.challengeId) setActiveChallengeId((data as any).challengeId);
      if ((data as any)?.expiresAt) setActiveExpiresAt((data as any).expiresAt);
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

  // Trusted device unreachable → email a 6-digit code instead.
  const switchToCode = async () => {
    if (optionBusy) return;
    setOptionBusy('email');
    try {
      const { data, error } = await supabase.functions.invoke('auth-login-approval', {
        body: { action: 'switch_to_code', challengeId: approvalChallengeId },
      });
      const payload = (data as any) || {};
      if (error || payload.ok === false || !payload.challengeId) {
        const reason = payload.error || error?.message || 'unknown';
        if (reason === 'expired') toast.error('This sign-in request has expired. Try again.');
        else if (reason === 'email_failed') toast.error("Couldn't send the email right now — try SMS instead.");
        else if (reason === 'no_session') toast.error('This request can no longer be switched. Try again.');
        else toast.error("Couldn't email a code — try SMS instead.");
        return;
      }
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      setActiveChallengeId(payload.challengeId);
      setActiveExpiresAt(payload.expiresAt);
      if (payload.email) setCurrentEmail(payload.email);
      setDigits(['', '', '', '', '', '']);
      submittedRef.current = false;
      setCurrentMode('code');
      toast.success(`Code sent to ${payload.email || currentEmail}`);
    } catch {
      toast.error("Couldn't switch to email code");
    } finally {
      setOptionBusy(null);
    }
  };

  // Trusted device unreachable → text a 6-digit code to verified phone.
  const switchToSms = async () => {
    if (optionBusy) return;
    setOptionBusy('sms');
    try {
      const { data, error } = await supabase.functions.invoke('auth-login-approval', {
        body: { action: 'switch_to_sms', challengeId: approvalChallengeId },
      });
      const payload = (data as any) || {};
      if (error || payload.ok === false || !payload.challengeId) {
        const reason = payload.error || error?.message || 'unknown';
        if (reason === 'expired') toast.error('This sign-in request has expired. Try again.');
        else if (reason === 'no_verified_phone') toast.error('No verified phone on this account. Try email instead.');
        else if (reason === 'no_session') toast.error('This request can no longer be switched. Try again.');
        else if (reason === 'rate_limited') toast.error('Too many SMS attempts. Try email instead.');
        else toast.error("Couldn't send SMS — try email instead.");
        return;
      }
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      setActiveChallengeId(payload.challengeId);
      setActiveExpiresAt(payload.expiresAt);
      setPhoneMasked(payload.phoneMasked ?? null);
      setDigits(['', '', '', '', '', '']);
      submittedRef.current = false;
      setCurrentMode('sms');
      toast.success(`Code texted to ${payload.phoneMasked || 'your phone'}`);
    } catch {
      toast.error("Couldn't send SMS code");
    } finally {
      setOptionBusy(null);
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
            {currentMode === 'code' && <Mail className="w-5 h-5 text-primary" />}
            {currentMode === 'sms' && <Smartphone className="w-5 h-5 text-primary" />}
            {currentMode === 'approval' && <Smartphone className="w-5 h-5 text-primary" />}
            {currentMode === 'options' && <ShieldCheck className="w-5 h-5 text-primary" />}
            {currentMode === 'code' && 'Enter your code'}
            {currentMode === 'sms' && 'Enter the SMS code'}
            {currentMode === 'approval' && 'Approve sign-in'}
            {currentMode === 'options' && 'More sign-in options'}
          </DialogTitle>
          <DialogDescription>
            {currentMode === 'code' && (
              <>We sent a 6-digit code to <span className="font-medium text-foreground">{currentEmail}</span>. It expires {expiryLabel ? <>in <span className="font-mono">{expiryLabel}</span></> : 'soon'}.</>
            )}
            {currentMode === 'sms' && (
              <>We texted a 6-digit code to <span className="font-medium text-foreground">{phoneMasked || 'your phone'}</span>. It expires {expiryLabel ? <>in <span className="font-mono">{expiryLabel}</span></> : 'soon'}.</>
            )}
            {currentMode === 'approval' && (
              <>Open VYBE on a trusted device and tap <span className="font-medium text-foreground">Approve</span>. We&apos;ll continue automatically.</>
            )}
            {currentMode === 'options' && (
              <>Pick another way to finish signing in.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {(currentMode === 'code' || currentMode === 'sms') ? (
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
              {currentMode === 'code' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || resendCooldown > 0}
                  onClick={resendCode}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </Button>
              ) : <span />}
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
        ) : currentMode === 'options' ? (
          <div className="space-y-3">
            <Button variant="secondary" className="w-full" disabled={busy} onClick={switchToCode}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Mail className="w-4 h-4 mr-1.5" /> Email me a code</>}
            </Button>
            <Button variant="secondary" className="w-full" disabled={busy} onClick={switchToSms}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Smartphone className="w-4 h-4 mr-1.5" /> Text me a code (SMS)</>}
            </Button>
            <Button variant="ghost" className="w-full" disabled={busy} onClick={() => setCurrentMode('approval')}>
              Back to device approval
            </Button>
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
              variant="secondary"
              className="w-full"
              disabled={busy}
              onClick={() => setCurrentMode('options')}
            >
              <KeyRound className="w-4 h-4 mr-1.5" /> More sign-in options
            </Button>
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
