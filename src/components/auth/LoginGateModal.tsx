import { AuthWaveSurface } from './AuthAtmosphere';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Loader2, Mail, ShieldCheck, Smartphone, ShieldAlert, KeyRound } from 'lucide-react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { motion } from 'framer-motion';
import { gateVerifyErrorMessage, parseEdgeInvokeResult } from '@/lib/edgeFunctionResponse';
import { checkedEmailChallenge } from '@/lib/emailConfirmation';
import type { FunctionInvokeResult } from '@/lib/firebase/types';

type Mode = 'code' | 'approval' | 'options' | 'sms';

export const LOGIN_CODE_WAIT_MS = 15_000;
async function waitForCodeCheck<T>(request: PromiseLike<T>, onDelayed: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A slow response is still authoritative. Keep observing the original
    // one-use request instead of requiring another tap to consume its reply.
    timer = setTimeout(onDelayed, LOGIN_CODE_WAIT_MS);
    return await request;
  } finally { clearTimeout(timer); }
}

/** Tick only the label, not the OTP, dialog and response effects every second. */
function CodeExpiry({ expiresAt }: { expiresAt?: string }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!expiresAt) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  if (!Number.isFinite(expiry)) return <>It expires soon.</>;
  const seconds = Math.max(0, Math.floor((expiry - now) / 1000));
  if (!seconds) return <>This sign-in request has expired.</>;
  return <>It expires in <span className="font-mono">{Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, '0')}</span>.</>;
}

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
  /** Firebase path: custom token from approve poll. Supabase legacy: access/refresh pair. */
  onSuccess: (session: SessionTokens | null, customToken?: string | null, confirmation?: { emailChallengeId: string }, guard?: () => void) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Blocking 2FA / login-approval gate. Used in two flows:
 * - mode="code": email 2FA. User types the 6-digit code; we verify and on
 *   success we receive session tokens (legacy) or continue with existing auth.
 * - mode="approval": Instagram-style trusted-device approval. We poll until
 *   the trusted device approves; the approval response carries a Firebase
 *   custom token (or legacy session tokens).
 *
 * While this modal is open the attempting device has soft-signed-out — no
 * usable session until approval completes.
 */
export function LoginGateModal({
  open, mode, email, challengeId, expiresAt,
  approvalDevice, approvalLocation,
  onSuccess, onCancel,
}: Props) {
  const [currentMode, setCurrentMode] = useState<Mode>(mode);
  const [currentEmail, setCurrentEmail] = useState(email);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [activeExpiresAt, setActiveExpiresAt] = useState(expiresAt);
  const [activeChallengeId, setActiveChallengeId] = useState(challengeId);
  const [phoneMasked, setPhoneMasked] = useState<string | null>(null);
  const [optionBusy, setOptionBusy] = useState<null | 'email' | 'sms'>(null);
  const [approvalChallengeId, setApprovalChallengeId] = useState(challengeId);
  const [codeAccepted, setCodeAccepted] = useState(false);
  const [verificationDelayed, setVerificationDelayed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // A delayed one-use request stays observed, never submitted a second time.
  const pendingVerificationRef = useRef<{ context: object; request: PromiseLike<FunctionInvokeResult> } | null>(null);
  // Keep the accepted receipt only in this mounted challenge, never in storage.
  const acceptedRef = useRef<{ context: object; token: string | null; session: SessionTokens | null; confirmation?: { emailChallengeId: string }; expires: number } | null>(null);

  const pollTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const submittedRef = useRef(false);
  const verificationRunningRef = useRef(false);
  const context = useMemo(() => ({}), [open, challengeId, mode, email, expiresAt]);
  const contextRef = useRef<object | null>(context);
  contextRef.current = context;
  useEffect(() => {
    contextRef.current = context;
    return () => {
      if (contextRef.current === context) contextRef.current = null;
      if (acceptedRef.current?.context === context) acceptedRef.current = null;
      if (pendingVerificationRef.current?.context === context) pendingVerificationRef.current = null;
    };
  }, [context]);
  const current = useCallback((captured: object) => open && contextRef.current === captured, [open]);


  // ── Expiry countdown ─────────────────────────────────────
  useEffect(() => {
    setActiveExpiresAt(expiresAt);
    setActiveChallengeId(challengeId);
    setApprovalChallengeId(challengeId);
    setCurrentMode(mode);
    setCurrentEmail(email);
    setCode('');
    setBusy(false);
    setOptionBusy(null);
    setResendCooldown(0);
    submittedRef.current = false;
    verificationRunningRef.current = false;
    acceptedRef.current = null;
    setCodeAccepted(false);
    setVerificationDelayed(false);
    setFeedback(null);
    pendingVerificationRef.current = null;
  }, [open, challengeId, mode, email, expiresAt]);


  // Resend cooldown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = window.setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [resendCooldown]);

  // ── Approval realtime + polling fallback ─────────────────
  useEffect(() => {
    if (!open || currentMode !== 'approval') return;
    cancelledRef.current = false;

    const pollChallengeId = activeChallengeId;
    let retired = false;

    const finalize = (status: string, session?: any, customToken?: string | null) => {
      if (retired || cancelledRef.current) return;
      cancelledRef.current = true;
      if (status === 'approved') {
        const guard = () => { if (!current(context)) throw new Error('This sign-in view changed.'); };
        setBusy(true);
        void Promise.resolve().then(() => { guard(); return onSuccess(session ?? null, customToken ?? null, undefined, guard); })
          .catch(() => { if (current(context)) toast.error('Could not finish signing in. Please try again.'); })
          .finally(() => { if (current(context)) setBusy(false); });
      } else if (status === 'denied') {
        toast.error('Sign-in was declined on your other device');
        onCancel();
      } else if (status === 'expired' || status === 'not_found') {
        toast.error('Login request expired — try signing in again');
        onCancel();
      }
    };

    let sessionRetryCount = 0;

    const poll = async () => {
      if (retired || cancelledRef.current) return;
      try {
        const { data, error } = await db.functions.invoke('auth-login-approval', {
          body: { action: 'poll', challengeId: pollChallengeId },
        });
        if (retired || cancelledRef.current) return;
        if (!error) {
          const status = (data as any)?.status;
          if (status === 'approved') {
            const customToken = (data as any)?.customToken ?? null;
            const session = (data as any)?.session ?? null;
            if (customToken || (session?.access_token && session?.refresh_token)) {
              finalize('approved', session, customToken);
              return;
            }
            // Broadcast may have scrubbed metadata before poll — retry briefly.
            if (sessionRetryCount < 4) {
              sessionRetryCount += 1;
              pollTimerRef.current = window.setTimeout(poll, 400);
              return;
            }
            toast.error('This sign-in could not be completed. Please sign in again.');
            cancelledRef.current = true;
            onCancel();
            return;
          }
          if (status === 'denied' || status === 'expired' || status === 'not_found') {
            finalize(status);
            return;
          }
        }
      } catch {}
      if (!retired && document.visibilityState === 'visible' && !cancelledRef.current) {
        pollTimerRef.current = window.setTimeout(poll, 1500);
      }
    };

    // Instant resolution via broadcast from auth-login-approval `respond`.
    const bc = db
      .channel(`login-approval:${pollChallengeId}`)
      .on('broadcast', { event: 'resolved' }, (payload: any) => {
        const status = payload?.payload?.status;
        const session = payload?.payload?.session;
        const customToken = payload?.payload?.customToken;
        if (status === 'approved') {
          if (customToken || (session?.access_token && session?.refresh_token)) {
            finalize('approved', session, customToken);
          } else {
            // Fall back to poll — edge may still be handing back the session row.
            if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
            poll();
          }
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
      retired = true;
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
      db.removeChannel(bc);
    };
  }, [open, currentMode, activeChallengeId, onSuccess, onCancel, context, current]);

  // ── Verify code (email or sms) ───────────────────────────
  const verifyCode = useCallback(async (codeStr: string) => {
    if (busy || optionBusy || verificationRunningRef.current || (submittedRef.current && !acceptedRef.current)) return;
    if (!acceptedRef.current && !pendingVerificationRef.current && !/^\d{6}$/.test(codeStr)) return;
    const captured = context;
    const guard = () => { if (!current(captured)) throw new Error('This sign-in view changed.'); };
    submittedRef.current = true;
    verificationRunningRef.current = true;
    setBusy(true);
    setFeedback(null);
    const fail = (message: string) => { setFeedback(message); toast.error(message); };
    try {
      const accepted = acceptedRef.current;
      if (accepted) {
        guard();
        if (accepted.context !== captured || !Number.isFinite(accepted.expires) || accepted.expires <= Date.now()) {
          acceptedRef.current = null;
          setCodeAccepted(false);
          setCode('');
          submittedRef.current = false;
          fail('This sign-in request expired. Please sign in again.');
          return;
        }
        await onSuccess(accepted.session, accepted.token, accepted.confirmation, guard);
        if (current(captured)) acceptedRef.current = null;
        return;
      }
      const fn = currentMode === 'sms' ? 'auth-2fa-verify-phone' : 'auth-2fa-verify';
      if (!pendingVerificationRef.current) pendingVerificationRef.current = {
        context: captured,
        request: db.functions.invoke(fn, { body: { challengeId: activeChallengeId, code: codeStr } }),
      };
      const pending = pendingVerificationRef.current;
      guard();
      if (pending.context !== captured) throw new Error('This sign-in view changed.');
      const result = await waitForCodeCheck(pending.request, () => {
        if (!current(captured)) return;
        setVerificationDelayed(true);
        setCode('');
        // Let the person change accounts while the original check finishes.
        // The running ref and context guard still prevent duplicate/stale work.
        setBusy(false);
      });
      const { payload, errorCode } = await parseEdgeInvokeResult(result);
      if (!current(captured)) return;
      pendingVerificationRef.current = null;
      setVerificationDelayed(false);
      setBusy(true);

      if (result.error || errorCode || payload?.ok !== true) {
        const transportCode = String(result.error?.code || result.error?.name || '').replace(/^functions\//, '');
        fail(gateVerifyErrorMessage(errorCode || transportCode));
        setCode('');
        submittedRef.current = false;
        return;
      }

      const customToken =
        typeof (payload as { customToken?: unknown }).customToken === 'string'
          ? (payload as { customToken: string }).customToken
          : null;
      const session = (payload as { session?: SessionTokens | null }).session ?? null;
      if (customToken || (session?.access_token && session?.refresh_token)) {
        const confirmation = currentMode === 'code' ? { emailChallengeId: activeChallengeId } : undefined;
        const receiptSession = customToken ? null : session;
        const expiry = activeExpiresAt ? new Date(activeExpiresAt).getTime() : Date.now() + 600_000;
        acceptedRef.current = { context: captured, token: customToken, session: receiptSession, confirmation, expires: Math.min(expiry, Date.now() + 600_000) };
        setCodeAccepted(true);
        setCode('');
        await onSuccess(receiptSession, customToken, confirmation, guard);
        if (current(captured)) acceptedRef.current = null;
        return;
      }

      fail('No sign-in receipt was returned. Please sign in again.');
      setCode('');
      submittedRef.current = false;
    } catch (error) {
      if (!current(captured)) return;
      if (acceptedRef.current?.context === captured) {
        fail('Code accepted, but sign-in could not finish. Check your connection and tap Finish signing in.');
        return;
      }
      pendingVerificationRef.current = null;
      setVerificationDelayed(false);
      fail('Verification failed — check your connection and try again.');
      setCode('');
      submittedRef.current = false;
    } finally {
      if (current(captured)) { verificationRunningRef.current = false; setBusy(false); }
    }
  }, [busy, activeChallengeId, activeExpiresAt, onSuccess, currentMode, context, current, optionBusy]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    if ((currentMode === 'code' || currentMode === 'sms') && code.length === 6 && /^\d{6}$/.test(code)) {
      verifyCode(code);
    }
  }, [code, currentMode, verifyCode]);

  const resendCode = async () => {
    if (resendCooldown > 0 || busy || verificationDelayed) return;
    const captured = context;
    if (currentMode === 'sms') {
      await switchToSms();
      return;
    }
    try {
      setBusy(true);
      const { data, error } = await db.functions.invoke('auth-2fa-request', {
        body: { email: currentEmail, challengeId: activeChallengeId },
      });
      if (!current(captured)) return;
      if (error || (data as any)?.ok !== true || (data as any)?.error) {
        toast.error("Couldn't send a new code. Try again in a moment.");
        return;
      }
      if ((data as any)?.requires2fa === false) {
        toast.error("Couldn't resend the verification email. Try signing in again.");
        return;
      }
      const receipt = checkedEmailChallenge(data, activeChallengeId);
      setActiveChallengeId(receipt.challengeId);
      setActiveExpiresAt(receipt.expiresAt);
      toast.success('New code sent');
      setResendCooldown(30);
      setCode('');
      submittedRef.current = false;
    } catch {
      if (current(captured)) toast.error("Couldn't send a new code. Please try again.");
    } finally {
      if (current(captured)) setBusy(false);
    }
  };

  const denySelf = async () => {
    const captured = context;
    try {
      setBusy(true);
      const { data, error } = await db.functions.invoke('auth-login-approval', {
        body: { action: 'deny_self', challengeId },
      });
      if (!current(captured)) return;
      if (error || data?.ok !== true || data.status !== 'denied') throw new Error('Denied receipt missing');
      toast.success('Sign-in denied. Change your password if this wasn\'t you.');
      onCancel();
    } catch {
      if (current(captured)) toast.error('Sign-in could not be denied. Please try again.');
    } finally {
      if (current(captured)) setBusy(false);
    }
  };

  // Trusted device unreachable → email a 6-digit code instead.
  const switchToCode = async () => {
    if (optionBusy) return;
    const captured = context;
    setOptionBusy('email');
    try {
      const { data, error } = await db.functions.invoke('auth-login-approval', {
        body: { action: 'switch_to_code', challengeId: approvalChallengeId },
      });
      if (!current(captured)) return;
      const payload = (data as any) || {};
      if (error || payload.ok !== true || !payload.challengeId) {
        const reason = payload.error || error?.message || 'unknown';
        if (reason === 'expired') toast.error('This sign-in request has expired. Try again.');
        else if (reason === 'email_failed') toast.error("Couldn't send the email right now — try SMS instead.");
        else if (reason === 'no_session') toast.error('This request can no longer be switched. Try again.');
        else toast.error("Couldn't email a code — try SMS instead.");
        return;
      }
      const receipt = checkedEmailChallenge(payload, approvalChallengeId);
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      setActiveChallengeId(receipt.challengeId);
      setActiveExpiresAt(receipt.expiresAt);
      if (payload.email) setCurrentEmail(payload.email);
      setCode('');
      submittedRef.current = false;
      setCurrentMode('code');
      toast.success(`Code sent to ${payload.email || currentEmail}`);
    } catch {
      if (current(captured)) toast.error("Couldn't switch to email code");
    } finally {
      if (current(captured)) setOptionBusy(null);
    }
  };

  // Trusted device unreachable → text a 6-digit code to verified phone.
  const switchToSms = async () => {
    if (optionBusy) return;
    const captured = context;
    setOptionBusy('sms');
    try {
      const { data, error } = await db.functions.invoke('auth-login-approval', {
        body: { action: 'switch_to_sms', challengeId: approvalChallengeId },
      });
      if (!current(captured)) return;
      const payload = (data as any) || {};
      if (error || payload.ok !== true || !payload.challengeId) {
        const reason = payload.error || error?.message || 'unknown';
        if (reason === 'expired') toast.error('This sign-in request has expired. Try again.');
        else if (reason === 'no_verified_phone') toast.error('No verified phone on this account. Try email instead.');
        else if (reason === 'twilio_not_configured') toast.error('SMS is not configured yet. Try email instead.');
        else if (reason === 'no_session') toast.error('This request can no longer be switched. Try again.');
        else if (reason === 'rate_limited') toast.error('Too many SMS attempts. Try email instead.');
        else toast.error("Couldn't send SMS — try email instead.");
        return;
      }
      const receipt = checkedEmailChallenge(payload, approvalChallengeId);
      cancelledRef.current = true;
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      setActiveChallengeId(receipt.challengeId);
      setActiveExpiresAt(receipt.expiresAt);
      setPhoneMasked(payload.phoneMasked ?? null);
      setCode('');
      submittedRef.current = false;
      setCurrentMode('sms');
      setResendCooldown(30);
      toast.success(`Code texted to ${payload.phoneMasked || 'your phone'}`);
    } catch {
      if (current(captured)) toast.error("Couldn't send SMS code");
    } finally {
      if (current(captured)) setOptionBusy(null);
    }
  };



  // Lock dismissal while a verify/poll is in flight or while we're handling a
  // submission, so users can't accidentally drop the gate by tapping outside.
  const lockDismiss = busy || optionBusy !== null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v && !lockDismiss) onCancel(); }}
    >
      <DialogContent
        className="auth-gate-panel sm:max-w-md"
        overlayClassName="auth-gate-overlay"
        onEscapeKeyDown={(e) => { if (lockDismiss) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (lockDismiss) e.preventDefault(); }}
        onInteractOutside={(e) => { if (lockDismiss) e.preventDefault(); }}
      >
        <AuthWaveSurface busy={busy} className="auth-gate-wave">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentMode === 'code' && <Mail className="w-5 h-5 text-primary" />}
            {currentMode === 'sms' && <Smartphone className="w-5 h-5 text-primary" />}
            {currentMode === 'approval' && <Smartphone className="w-5 h-5 text-primary" />}
            {currentMode === 'options' && <ShieldCheck className="w-5 h-5 text-primary" />}
            {currentMode === 'code' && (codeAccepted ? 'Finish signing in' : verificationDelayed ? 'Checking your code' : 'Enter your code')}
            {currentMode === 'sms' && (codeAccepted ? 'Finish signing in' : verificationDelayed ? 'Checking your code' : 'Enter the SMS code')}
            {currentMode === 'approval' && 'Waiting for confirmation'}
            {currentMode === 'options' && 'More sign-in options'}
          </DialogTitle>
          <DialogDescription>
            {codeAccepted && <>Code accepted. We’re finishing your secure sign-in.</>}
            {currentMode === 'code' && !codeAccepted && (
              <>We sent a 6-digit code to <span className="font-medium text-foreground">{currentEmail}</span>. <CodeExpiry expiresAt={activeExpiresAt} /></>
            )}
            {currentMode === 'sms' && !codeAccepted && (
              <>We texted a 6-digit code to <span className="font-medium text-foreground">{phoneMasked || 'your phone'}</span>. <CodeExpiry expiresAt={activeExpiresAt} /></>
            )}
            {currentMode === 'approval' && (
              <>We sent a login request to your other device. Open VYBE there and tap <span className="font-medium text-foreground">Approve</span> to continue.</>
            )}
            {currentMode === 'options' && (
              <>Pick another way to finish signing in.</>
            )}
          </DialogDescription>
        </DialogHeader>

        {(currentMode === 'code' || currentMode === 'sms') ? (
          <div className="space-y-4">
            {!codeAccepted && !verificationDelayed && <div className="flex justify-center pt-2">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={code}
                onChange={setCode}
                disabled={busy || optionBusy !== null}
                autoFocus
                aria-label="Verification code"
                inputMode="numeric"
              >
                <InputOTPGroup className="gap-1.5 sm:gap-2">
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className="w-[clamp(1.75rem,8vw,2.75rem)] h-12 sm:h-14 text-xl font-semibold rounded-xl bg-muted border-border"
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>}

            {busy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                {codeAccepted ? 'Loading your account…' : 'Checking your code…'}
              </motion.div>
            )}

            {feedback && <p role="alert" className="text-sm leading-relaxed text-muted-foreground">{feedback}</p>}
            {verificationDelayed && <p role="status" className="text-sm leading-relaxed text-muted-foreground">Your connection is taking longer. We’ll continue automatically when your code is checked. You can leave this screen to change accounts.</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              {!codeAccepted && !verificationDelayed ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || resendCooldown > 0 || optionBusy !== null}
                  onClick={resendCode}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </Button>
              ) : <span />}
              <div className="flex flex-wrap justify-end gap-2 ml-auto">
                <Button variant="ghost" disabled={busy} onClick={onCancel}>
                  Change account
                </Button>
                {!verificationDelayed && <Button
                  disabled={busy || optionBusy !== null || (!codeAccepted && !verificationDelayed && code.length !== 6)}
                  onClick={() => verifyCode(code)}
                >
                  {busy
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <><ShieldCheck className="w-4 h-4 mr-1.5" /> {codeAccepted ? 'Finish signing in' : 'Verify'}</>}
                </Button>}
              </div>
            </div>
          </div>
        ) : currentMode === 'options' ? (
          <div className="space-y-3">
            <Button variant="secondary" className="w-full" disabled={optionBusy !== null} onClick={switchToCode}>
              {optionBusy === 'email'
                ? <><Loader2 data-allow-animation="true" className="w-4 h-4 mr-1.5 animate-spin" /> Sending email…</>
                : <><Mail className="w-4 h-4 mr-1.5" /> Email me a code</>}
            </Button>
            <Button variant="secondary" className="w-full" disabled={optionBusy !== null} onClick={switchToSms}>
              {optionBusy === 'sms'
                ? <><Loader2 data-allow-animation="true" className="w-4 h-4 mr-1.5 animate-spin" /> Texting code…</>
                : <><Smartphone className="w-4 h-4 mr-1.5" /> Text me a code (SMS)</>}
            </Button>
            <Button variant="ghost" className="w-full" disabled={optionBusy !== null} onClick={() => setCurrentMode('approval')}>
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
                <div className="text-foreground font-medium">Waiting for approval…</div>
                {approvalDevice && <div>{approvalDevice}</div>}
                {(approvalLocation?.city || approvalLocation?.country) && (
                  <div>
                    {approvalLocation?.city ? `${approvalLocation.city}, ` : ''}
                    {approvalLocation?.country ?? ''}
                  </div>
                )}
                {approvalLocation?.ip && <div className="font-mono text-xs">{approvalLocation.ip}</div>}
                {activeExpiresAt && <div><CodeExpiry expiresAt={activeExpiresAt} /></div>}
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
        </AuthWaveSurface>
      </DialogContent>
    </Dialog>
  );
}
