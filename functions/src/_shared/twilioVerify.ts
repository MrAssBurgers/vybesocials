import { HttpsError } from 'firebase-functions/v2/https';
export const TWILIO_SECRETS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_VERIFY_SERVICE_SID',
] as const;

type TwilioConfig = {
  accountSid: string;
  authToken: string;
  verifyServiceSid: string;
};

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const verifyServiceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();
  if (!accountSid || !authToken || !verifyServiceSid) return null;
  if (!accountSid.startsWith('AC')) return null;
  if (!verifyServiceSid.startsWith('VA')) return null;
  return { accountSid, authToken, verifyServiceSid };
}

export async function twilioVerifyStart(
  cfg: TwilioConfig,
  phoneE164: string,
): Promise<{ ok: true } | { ok: false; error: string; detail?: string }> {
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(cfg.verifyServiceSid)}/Verifications`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const body = new URLSearchParams({ To: phoneE164, Channel: 'sms' });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: { status?: string; code?: number; message?: string } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    const msg = String(json.message || text || res.status).slice(0, 160);
    if (/valid.*phone|not a valid/i.test(msg)) {
      return { ok: false, error: 'invalid_phone_for_twilio', detail: msg };
    }
    if (/blocked|blacklist|unreachable/i.test(msg)) {
      return { ok: false, error: 'phone_blocked', detail: msg };
    }
    if (json.code === 20003 || /authenticate/i.test(msg)) {
      return { ok: false, error: 'twilio_account_sid_invalid', detail: msg };
    }
    if (json.code === 20404 || /service/i.test(msg)) {
      return { ok: false, error: 'twilio_verify_service_sid_invalid', detail: msg };
    }
    return { ok: false, error: 'sms_send_failed', detail: msg };
  }
  return json.status === 'pending' ? { ok: true } : { ok: false, error: 'sms_send_failed' };
}

export async function twilioVerifyCheck(
  cfg: TwilioConfig,
  phoneE164: string,
  code: string,
): Promise<{ ok: boolean }> {
  const url = `https://verify.twilio.com/v2/Services/${encodeURIComponent(cfg.verifyServiceSid)}/VerificationCheck`;
  const auth = Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64');
  const body = new URLSearchParams({ To: phoneE164, Code: code });
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  let json: { status?: string; valid?: boolean } = {};
  try {
    json = text ? (JSON.parse(text) as typeof json) : {};
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new HttpsError('unavailable', 'SMS verification is unavailable. Please retry.');
  if (json.status !== 'approved' && json.status !== 'pending') throw new HttpsError('unavailable', 'SMS verification could not be confirmed. Please retry.');
  return { ok: json.status === 'approved' && json.valid !== false };
}
