import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Phone, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import {
  capturePhoneVerificationActor, confirmPhoneVerification, normalizeVerificationPhone, PHONE_VERIFIED_EVENT,
  phoneVerificationFailure, phoneVerificationState, requestPhoneVerification,
  type PhoneVerificationChallenge, type PhoneVerificationStatus,
} from '@/lib/phoneVerificationService';

interface Props { embedded?: boolean; onVerified?: (phone: string) => void }
interface View {
  key: string; status?: PhoneVerificationStatus; loading: boolean; stateError?: string;
  stage: 'idle' | 'entering' | 'code'; phone: string; code: string;
  challenge?: PhoneVerificationChallenge & { phone: string }; error?: string; sendFailed: boolean;
  sending: boolean; verifying: boolean; cooldownUntil: number;
}
const initial = (key: string): View => ({ key, loading: true, stage: 'idle', phone: '', code: '', sending: false, verifying: false, cooldownUntil: 0, sendFailed: false });

export function PhoneNumberCard({ embedded, onVerified }: Props) {
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const ready = !!user?.id && !!profile?.id && profile.user_id === user.id && session.uid === user.id;
  const key = JSON.stringify([user?.id, profile?.id, profile?.user_id, session.uid, session.epoch]);
  const [stored, setStored] = useState<View>(() => initial(key));
  const view = ready && stored.key === key ? stored : initial(key);
  const [now, setNow] = useState(Date.now);
  const live = useRef({ key, mounted: true, version: 0 });
  live.current.key = key;
  const pending = useRef<object | null>(null);
  const attempt = useRef<{ key: string; phone: string; requestId: string } | null>(null);
  const read = useRef<AbortController | null>(null);
  const update = (change: (old: View) => View) => setStored(old => change(old.key === key ? old : initial(key)));
  const capture = (version: number | null = live.current.version) => {
    if (!ready) throw new Error('Wait for your signed-in profile to load.');
    return capturePhoneVerificationActor(user.id, profile.id, () => {
      if (!live.current.mounted || live.current.key !== key || (version !== null && live.current.version !== version)) throw Object.assign(new Error('Reopen phone verification.'), { code: 'account-changed' });
    });
  };
  const loadStatus = async () => {
    read.current?.abort(); const controller = new AbortController(); read.current = controller;
    // Account status is independent of the editable code draft. Moving between
    // form stages must not strand a status refresh in its loading state.
    let actor: ReturnType<typeof capture>; try { actor = capture(null); } catch { return; }
    update(old => ({ ...old, loading: true, stateError: undefined, status: undefined }));
    try {
      const status = await phoneVerificationState(actor, controller.signal); actor.guard();
      if (!controller.signal.aborted) update(old => ({ ...old, status, loading: false }));
    } catch (error) {
      try { actor.guard(); } catch { return; }
      if (!controller.signal.aborted) update(old => ({ ...old, loading: false, stateError: phoneVerificationFailure(error) }));
    }
  };
  useEffect(() => {
    live.current.mounted = true;
    return () => { live.current.mounted = false; live.current.version++; read.current?.abort(); };
  }, []);
  useEffect(() => {
    live.current.version++; pending.current = null; attempt.current = null;
    setStored(initial(key)); if (ready) void loadStatus();
    return () => { read.current?.abort(); };
  }, [key, ready]);
  useEffect(() => {
    if (view.stage !== 'code') return;
    setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(timer); };
  }, [view.stage]);

  const move = (stage: 'idle' | 'entering') => {
    live.current.version++; pending.current = null;
    update(old => ({ ...old, stage, code: '', challenge: undefined, error: undefined, sendFailed: false, sending: false, verifying: false }));
  };
  const sendCode = async (resend = false) => {
    if (pending.current || !view.status) return;
    const phone = normalizeVerificationPhone(view.phone);
    if (!phone) { update(old => ({ ...old, error: 'Enter a valid phone number. Use a country code for numbers outside the US or Canada; do not include letters or extensions.', sendFailed: false })); return; }
    let actor: ReturnType<typeof capture>; try { actor = capture(); } catch { return; }
    if (resend || attempt.current?.key !== key || attempt.current.phone !== phone) attempt.current = { key, phone, requestId: crypto.randomUUID() };
    const operation = {}; pending.current = operation;
    update(old => ({ ...old, sending: true, error: undefined, sendFailed: false }));
    try {
      const challenge = await requestPhoneVerification(actor, { phone, requestId: attempt.current.requestId }); actor.guard();
      update(old => ({ ...old, stage: 'code', code: '', challenge: { ...challenge, phone }, cooldownUntil: Date.now() + 60000 }));
      setNow(Date.now()); toast.success('Verification code sent');
    } catch (error) {
      try { actor.guard(); } catch { return; }
      update(old => ({ ...old, error: phoneVerificationFailure(error), sendFailed: true }));
    } finally {
      if (pending.current === operation) { pending.current = null; try { actor.guard(); update(old => ({ ...old, sending: false })); } catch { /* Old view. */ } }
    }
  };
  const confirmCode = async () => {
    if (pending.current || !view.challenge || !/^\d{6}$/.test(view.code)) return;
    let actor: ReturnType<typeof capture>; try { actor = capture(); } catch { return; }
    const operation = {}; pending.current = operation;
    update(old => ({ ...old, verifying: true, error: undefined, sendFailed: false }));
    try {
      const result = await confirmPhoneVerification(actor, { challengeId: view.challenge.challengeId, code: view.code, expectedPhone: view.challenge.phone }); actor.guard();
      read.current?.abort();
      update(old => ({ ...old, status: { ok: true, ownerUid: result.ownerUid, profileId: result.profileId, verified: true, maskedPhone: `+•••${result.phone.slice(-4)}`, legacyPhoneNeedsVerification: false },
        loading: false, stateError: undefined, stage: 'idle', phone: '', code: '', challenge: undefined, error: undefined }));
      attempt.current = null; toast.success('Phone verified');
      window.dispatchEvent(new Event(PHONE_VERIFIED_EVENT));
      actor.guard();
      try { onVerified?.(result.phone); } catch { console.error('Verified phone completion handler failed'); }
    } catch (error) {
      try { actor.guard(); } catch { return; }
      update(old => ({ ...old, error: phoneVerificationFailure(error) }));
    } finally {
      if (pending.current === operation) { pending.current = null; try { actor.guard(); update(old => ({ ...old, verifying: false })); } catch { /* Old view. */ } }
    }
  };
  const busy = view.sending || view.verifying;
  const cooldown = Math.max(0, Math.ceil((view.cooldownUntil - now) / 1000));
  const expired = view.challenge && view.challenge.expiresAt <= now;
  const inner = (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Phone className="w-5 h-5 mt-0.5 text-primary" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold flex items-center gap-2">Phone number{view.status?.verified && <CheckCircle2 className="w-4 h-4 text-emerald-500" aria-hidden="true" />}</div>
          <p className="text-xs text-muted-foreground">{view.status?.verified ? `${view.stage === 'code' ? 'Current account phone is verified' : 'Verified'} · ${view.status.maskedPhone}` : 'Verify a number to link it to your VYBE account. Contact discovery is a separate opt-in below.'}</p>
        </div>
        {view.status?.verified && view.stage === 'idle' && <Button size="sm" variant="ghost" onClick={() => move('entering')}>Change number</Button>}
      </div>
      {!ready ? <p role="status" className="text-xs text-muted-foreground">Waiting for your signed-in profile…</p>
        : <>
          {view.loading && <p role="status" className="text-xs text-muted-foreground">Checking phone status…</p>}
          {view.stateError && <div role="alert" className="space-y-2 text-sm"><p>{view.stateError}</p><Button variant="outline" onClick={() => void loadStatus()}>Retry phone status</Button></div>}
          {view.status?.legacyPhoneNeedsVerification && <p className="text-xs text-muted-foreground">Your previously saved number needs verification again before it can be linked to your account.</p>}
          {view.status && !view.status.verified && view.stage === 'idle' && <Button onClick={() => move('entering')} className="w-full">Add phone number</Button>}
          {view.error && <p role="alert" className="text-sm text-destructive">{view.error}</p>}
          {view.stage === 'entering' && <form className="space-y-2" onSubmit={event => { event.preventDefault(); void sendCode(); }}>
            <Input type="tel" inputMode="tel" autoComplete="tel" aria-label="Phone number" placeholder="+1 (555) 555-5555" value={view.phone} maxLength={40}
              onChange={event => { live.current.version++; update(old => ({ ...old, phone: event.target.value, error: undefined, sendFailed: false })); }} disabled={busy} />
            <div className="flex gap-2"><Button type="submit" disabled={busy || !view.status || !view.phone.trim()} className="flex-1">{view.sending ? 'Sending…' : view.sendFailed ? 'Retry sending' : 'Send code'}</Button><Button type="button" variant="ghost" onClick={() => move('idle')}>Cancel</Button></div>
          </form>}
          {view.stage === 'code' && <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to {view.challenge?.maskedPhone}.</p>
            <InputOTP aria-label="Verification code" autoComplete="one-time-code" inputMode="numeric" maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={view.code} disabled={busy}
              onChange={code => update(old => ({ ...old, code, error: undefined, sendFailed: false }))}>
              <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map(index => <InputOTPSlot key={index} index={index} />)}</InputOTPGroup>
            </InputOTP>
            {expired && <p role="status" className="text-xs text-muted-foreground">This code expired. If you already submitted it, retry verification or refresh phone status to check the result. Otherwise request a new code.</p>}
            <div className="flex flex-wrap gap-2"><Button onClick={() => void confirmCode()} disabled={busy || !/^\d{6}$/.test(view.code)} className="flex-1">{view.verifying ? 'Verifying…' : expired ? 'Retry verification' : 'Verify phone'}</Button>
              <Button variant="outline" disabled={busy || !view.status || (cooldown > 0 && !view.sendFailed)} onClick={() => void sendCode(!view.sendFailed)}>{view.sending ? 'Sending…' : view.sendFailed ? 'Retry sending' : cooldown > 0 ? `Resend (${cooldown})` : 'Resend code'}</Button></div>
            <Button variant="outline" className="w-full" disabled={view.loading} onClick={() => void loadStatus()}>Refresh phone status</Button>
            <p className="text-xs text-muted-foreground">Status shows the number currently linked to your account. Only a completed verification confirms this code request.</p>
            <div className="flex gap-2"><Button variant="ghost" onClick={() => move('entering')}>Change number</Button><Button variant="ghost" onClick={() => move('idle')}>Cancel</Button></div>
          </div>}
          {view.stage !== 'code' && view.status && <Button variant="ghost" size="sm" disabled={view.loading} onClick={() => void loadStatus()}>Refresh phone status</Button>}
        </>}
    </div>
  );
  return embedded ? inner : <Card className="p-4">{inner}</Card>;
}
