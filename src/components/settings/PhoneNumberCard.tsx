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

interface Props {
  /** When true, hides the card chrome — for use inside a forced verification modal. */
  embedded?: boolean;
  /** Open the phone input immediately (skip the idle "Add phone number" step). */
  startEntering?: boolean;
  onVerified?: (phone: string) => void;
}

export function PhoneNumberCard({ embedded, startEntering, onVerified }: Props) {
  const { user } = useAuth();
  const [phoneVerified, setPhoneVerified] = useState<boolean>(false);
  const [storedPhone, setStoredPhone] = useState<string>('');
  const [stage, setStage] = useState<'idle' | 'entering' | 'code'>(
    startEntering ? 'entering' : 'idle',
  );
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);

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
    const e164 = normalizeE164(phone);
    if (!e164) { toast.error('Enter a valid phone number'); return; }
    setSending(true);
    try {
      const { data, error } = await db.functions.invoke('phone-verify-request', {
        body: { phone: e164, purpose: phoneVerified ? 'change' : 'add', userId: user?.id },
      });
      if (error) throw error;
      const payload = (data as any) || {};
      if (payload.ok === false || payload.error) {
        const code = payload.error || 'sms_send_failed';
        const detail = payload.detail ? ` (${payload.detail})` : '';
        if (code === 'rate_limited') toast.error('Too many attempts. Try again later.');
        else if (code === 'phone_in_use') toast.error('That number is already on another VYBE account.');
        else if (code === 'twilio_not_configured') toast.error('SMS service is not configured. Contact support.');
        else if (code === 'twilio_verify_service_sid_invalid') toast.error('SMS misconfigured (invalid Verify SID). Contact support.');
        else if (code === 'twilio_account_sid_invalid') toast.error('SMS misconfigured (invalid Account SID). Contact support.');
        else if (code === 'invalid_phone' || code === 'invalid_phone_for_twilio') toast.error('Enter a valid phone number');
        else if (code === 'phone_blocked') toast.error('This number cannot receive SMS from us.');
        else toast.error(`Could not send code: ${code}${detail}`);
        return;
      }
      setChallengeId(payload.challengeId);
      setStage('code');
      setCooldown(60);
      toast.success(`Code sent to ${formatDisplayUS(e164)}`);
    } catch (e: any) {
      const msg = e?.message || '';
      toast.error(msg ? `Could not send code: ${msg}` : 'Could not send code');

    } finally {
      setSending(false);
    }
  };

  const confirmCode = async () => {
    if (!challengeId || code.length !== 6) return;
    setVerifying(true);
    try {
      const result = await db.functions.invoke('phone-verify-confirm', {
        body: { challengeId, code },
      });
      const { payload, errorCode } = await parseEdgeInvokeResult(result);
      if (errorCode) {
        toast.error(phoneVerifyErrorMessage(errorCode));
        return;
      }
      if (!payload) throw new Error('verify_failed');
      toast.success('Phone verified ✅');
      setPhoneVerified(true);
      setStoredPhone((payload as { phone?: string }).phone || normalizeE164(phone) || '');
      setStage('idle');
      setPhone(''); setCode(''); setChallengeId(null);
      onVerified?.((payload as { phone?: string }).phone);
    } catch (e: any) {
      toast.error(phoneVerifyErrorMessage(e?.message));
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
          <Button size="sm" variant="ghost" onClick={() => setStage('entering')}>Change</Button>
        )}
      </div>

      {!phoneVerified && stage === 'idle' && (
        <Button onClick={() => setStage('entering')} className="w-full">Add phone number</Button>
      )}

      {stage === 'entering' && (
        <div className="flex gap-2">
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="(555) 555-5555"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={sending}
          />
          <Button onClick={sendCode} disabled={sending || !phone.trim()}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send code'}
          </Button>
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
          <div className="flex gap-2">
            <Button onClick={confirmCode} disabled={verifying || code.length !== 6} className="flex-1">
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
            </Button>
            <Button
              variant="ghost"
              disabled={cooldown > 0 || sending}
              onClick={sendCode}
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
