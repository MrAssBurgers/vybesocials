// Initiates phone verification using Twilio Verify.
// Twilio generates, sends, and validates the OTP. We only track a
// `phone_verifications` row for rate limiting and to link userId/purpose.
import { corsHeaders, jsonResponse, getServiceClient, getClientIp } from '../_shared/security.ts';

const TTL_MS = 10 * 60 * 1000;

function normalizeE164(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const hasPlus = s.startsWith('+');
  s = s.replace(/[^\d]/g, '');
  if (!s) return null;
  if (hasPlus) return s.length >= 8 && s.length <= 15 ? '+' + s : null;
  if (s.length === 11 && s.startsWith('1')) return '+' + s;
  if (s.length === 10) return '+1' + s;
  return s.length >= 8 && s.length <= 15 ? '+' + s : null;
}

async function twilioVerifyStart(phone: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!sid || !token || !service) return { ok: false, error: 'twilio_not_configured' };

  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${service}/Verifications`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Channel: 'sms' }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) {
      console.error('Twilio Verify start failed', res.status, body);
      return { ok: false, error: body?.message || 'sms_send_failed' };
    }
    return { ok: true, status: body?.status };
  } catch (e) {
    console.error('twilioVerifyStart exception', e);
    return { ok: false, error: 'sms_send_exception' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { phone, purpose, userId } = await req.json().catch(() => ({}));
    const e164 = normalizeE164(phone);
    if (!e164) return jsonResponse({ error: 'invalid_phone' }, 400);
    const allowedPurposes = new Set(['signup', 'login', 'add', 'change']);
    const p = allowedPurposes.has(purpose) ? purpose : 'signup';

    const admin = getServiceClient();
    const ip = getClientIp(req);

    // Rate limit: max 1 send per 60s for this phone, max 5 per hour
    const sinceMin = new Date(Date.now() - 60_000).toISOString();
    const sinceHour = new Date(Date.now() - 3_600_000).toISOString();
    const { count: recent1m } = await admin
      .from('phone_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('phone', e164)
      .gte('created_at', sinceMin);
    if ((recent1m ?? 0) > 0) return jsonResponse({ error: 'rate_limited', retryAfter: 60 }, 429);

    const { count: recent1h } = await admin
      .from('phone_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('phone', e164)
      .gte('created_at', sinceHour);
    if ((recent1h ?? 0) >= 5) return jsonResponse({ error: 'rate_limited', retryAfter: 1800 }, 429);

    // For signup/add/change: ensure phone isn't already verified by someone else
    if (p === 'signup' || p === 'add' || p === 'change') {
      const { data: taken } = await admin
        .from('profiles')
        .select('id, user_id')
        .eq('phone_number', e164)
        .eq('phone_verified', true)
        .maybeSingle();
      if (taken && (!userId || taken.user_id !== userId)) {
        return jsonResponse({ error: 'phone_in_use' }, 409);
      }
    }

    // Create the tracking row first (Twilio holds the code itself).
    const { data: row, error: insErr } = await admin
      .from('phone_verifications')
      .insert({
        phone: e164,
        code: 'twilio',          // legacy NOT NULL column; Twilio Verify owns the real code
        code_hash: 'twilio',     // legacy column; unused with Twilio Verify
        purpose: p,
        user_id: userId ?? null,
        ip,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
      })
      .select('id, expires_at')
      .single();
    if (insErr || !row) {
      console.error('phone_verifications insert failed', insErr);
      return jsonResponse({ error: 'create_failed' }, 500);
    }

    const send = await twilioVerifyStart(e164);
    if (!send.ok) {
      return jsonResponse({ error: send.error || 'sms_send_failed' }, 502);
    }

    return jsonResponse({
      ok: true,
      challengeId: row.id,
      expiresAt: row.expires_at,
      phone: e164,
    });
  } catch (e) {
    console.error('phone-verify-request error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
