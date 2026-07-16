import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Phone, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { normalizeE164, formatDisplayUS, maskPhone } from '@/lib/phone';
import { parseEdgeInvokeResult, phoneVerifyErrorMessage } from '@/lib/edgeFunctionResponse';
import { debugSessionLog } from '@/lib/debugSessionLog';

interface Props {
  /** When true, hides the card chrome — for use inside a forced verification modal. */
  embedded?: boolean;
  onVerified?: (phone: string) => void;
}

export function PhoneNumberCard({ embedded, onVerified }: Props) {
  const { user } = useAuth();
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [storedPhone, setStoredPhone] = useState<string>('');
  const [stage, setStage] = useState<'idle' | 'entering' | 'code'>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await db.rpc('get_my_private_profile');
      const row = Array.isArray(data) ? data[0] : data;
      if (cancelled || !row) return;
      setPhoneVerified(!!row.phone_verified);
      setStoredPhone(row.phone_number || '');
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const sendCode = async () => {
    setInlineError(null);
    const e164 = normalizeE164(phone);
    // #region agent log
    debugSessionLog(
      'PhoneNumberCard.tsx:sendCode',
      'phone_send_attempt',
      {
        hasUser: Boolean(user?.id),
        rawLen: phone.trim().length,
        e164Ok: Boolean(e164),
        e164Len: e164 ? e164.length : 0,
      },
      'H-phone',
      'post-fix',
    );
    // #endregion
    if (!e164) {
      const msg = 'Enter a valid phone number';
      setInlineError(msg);
      toast.error(msg);
      return;
    }
    setSending(true);
    try {
      const { data, error } = await db.functions.invoke('phone-verify-request', {
        body: { phone: e164, purpose: phoneVerified ? 'change' : 'add', userId: user?.id },
      });
      // #region agent log
      debugSessionLog(
        'PhoneNumberCard.tsx:sendResult',
        'phone_send_result',
        {
          hasError: Boolean(error),
          errName: error?.name || null,
          errMsg: (error?.message || '').slice(0, 80),
          ok: (data as { ok?: boolean } | null)?.ok !== false,
          payloadError: String((data as { error?: string } | null)?.error || '').slice(0, 40),
        },
        'H-phone',
        'post-fix',
      );
      // #endregion
      if (error) throw error;
      const payload = (data as Record<string, unknown>) || {};
      if (payload.ok === false || payload.error) {
        const errCode = String(payload.error || 'sms_send_failed');
        const detail = payload.detail ? ` (${String(payload.detail).slice(0, 80)})` : '';
        let msg = `Could not send code: ${errCode}${detail}`;
        if (errCode === 'rate_limited') msg = 'Too many attempts. Try again later.';
        else if (errCode === 'phone_in_use') msg = 'That number is already on another VYBE account.';
        else if (errCode === 'twilio_not_configured') {
          msg = 'SMS is not configured yet. Ask an admin to set Twilio Verify secrets.';
        } else if (errCode === 'twilio_verify_service_sid_invalid') {
          msg = 'SMS misconfigured (invalid Verify SID). Contact support.';
        } else if (errCode === 'twilio_account_sid_invalid') {
          msg = 'SMS misconfigured (invalid Account SID). Contact support.';
        } else if (errCode === 'invalid_phone' || errCode === 'invalid_phone_for_twilio') {
          msg = 'Enter a valid phone number';
        } else if (errCode === 'phone_blocked') {
          msg = 'This number cannot receive SMS from us.';
        }
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      setChallengeId(String(payload.challengeId || ''));
      setStage('code');
      setCooldown(60);
      toast.success(`Code sent to ${formatDisplayUS(e164)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error && e.message ? `Could not send code: ${e.message}` : 'Could not send code';
      // #region agent log
      debugSessionLog(
        'PhoneNumberCard.tsx:sendCatch',
        'phone_send_catch',
        { msg: msg.slice(0, 100) },
        'H-phone',
        'post-fix',
      );
      // #endregion
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    if (!challengeId || code.length !== 6) return;
    setInlineError(null);
    setVerifying(true);
    try {
      const result = await db.functions.invoke('phone-verify-confirm', {
        body: { challengeId, code },
      });
      const { payload, errorCode } = await parseEdgeInvokeResult(result);
      if (errorCode) {
        const msg = phoneVerifyErrorMessage(errorCode);
        setInlineError(msg);
        toast.error(msg);
        return;
      }
      if (!payload) throw new Error('verify_failed');
      toast.success('Phone verified ✅');
      setPhoneVerified(true);
      setStoredPhone((payload as { phone?: string }).phone || normalizeE164(phone) || '');
      setStage('idle');
      setPhone(''); setCode(''); setChallengeId(null);
      onVerified?.((payload as { phone?: string }).phone);
    } catch (e: unknown) {
      const msg = phoneVerifyErrorMessage(e instanceof Error ? e.message : undefined);
      setInlineError(msg);
      toast.error(msg);
    } finally {
      setVerifying(false);
    }
  };

  const inner = (
    <div className="space-y-3">
      <div className="flex items-start gap-3">
        <Phone className="w-5 h-5 mt-0.5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-semibold">Phone number</div>
            {phoneVerified && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          </div>
          <div className="text-xs text-muted-foreground">
            {phoneVerified
              ? `Verified · ${maskPhone(storedPhone)}`
              : 'Add a phone to secure your account and let friends find you.'}
          </div>
        </div>
        {phoneVerified && stage === 'idle' && (
          <Button size="sm" variant="ghost" onClick={() => { setInlineError(null); setStage('entering'); }}>
            Change
          </Button>
        )}
      </div>

      {!phoneVerified && stage === 'idle' && (
        <Button onClick={() => { setInlineError(null); setStage('entering'); }} className="w-full">
          Add phone number
        </Button>
      )}

      {stage === 'entering' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setInlineError(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void sendCode();
                }
              }}
              disabled={sending}
            />
            <Button onClick={() => void sendCode()} disabled={sending || !phone.trim()}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send code'}
            </Button>
          </div>
          {inlineError && (
            <p className="text-xs text-destructive" role="alert">{inlineError}</p>
          )}
        </div>
      )}

      {stage === 'code' && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Enter the 6-digit code we texted you.</div>
          <InputOTP maxLength={6} pattern={REGEXP_ONLY_DIGITS} value={code} onChange={setCode}>
            <InputOTPGroup>
              {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
          {inlineError && (
            <p className="text-xs text-destructive" role="alert">{inlineError}</p>
          )}
          <div className="flex gap-2">
            <Button onClick={() => void confirmCode()} disabled={verifying || code.length !== 6} className="flex-1">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
            </Button>
            <Button
              variant="ghost"
              disabled={cooldown > 0 || sending}
              onClick={() => void sendCode()}
            >
              {cooldown > 0 ? `Resend (${cooldown})` : 'Resend'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (embedded) return inner;
  return <Card className="p-4">{inner}</Card>;
}
