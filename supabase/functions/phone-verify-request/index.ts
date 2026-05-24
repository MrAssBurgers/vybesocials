// Sends a 6-digit SMS verification code via OneSignal SMS.
// Stores SHA-256(code) in phone_verifications with a 10-min TTL.
// Rate-limited per phone number to deter abuse.
import { corsHeaders, jsonResponse, getServiceClient, sha256Hex, getClientIp } from '../_shared/security.ts';

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

async function sendOneSignalSms(phone: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const appId = Deno.env.get('ONESIGNAL_APP_ID');
  const apiKey = Deno.env.get('ONESIGNAL_REST_API_KEY');
  if (!appId || !apiKey) return { ok: false, error: 'sms_not_configured' };

  try {
    const res = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        app_id: appId,
        name: 'sms',
        target_channel: 'sms',
        include_phone_numbers: [phone],
        sms_media_urls: [],
        contents: { en: `Your VYBE verification code is ${code}. It expires in 10 minutes.` },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('OneSignal SMS failed', res.status, body);
      // Fallback: try Twilio if configured
      const twAcct = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twTok = Deno.env.get('TWILIO_AUTH_TOKEN');
      const twFrom = Deno.env.get('TWILIO_PHONE_NUMBER');
      if (twAcct && twTok && twFrom) {
        const tw = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twAcct}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${twAcct}:${twTok}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: phone, From: twFrom,
            Body: `Your VYBE verification code is ${code}. It expires in 10 minutes.`,
          }),
        });
        if (tw.ok) return { ok: true };
        const tb = await tw.text().catch(() => '');
        console.error('Twilio fallback failed', tw.status, tb);
        return { ok: false, error: 'sms_send_failed' };
      }
      return { ok: false, error: body?.errors?.[0] || 'sms_send_failed' };
    }
    return { ok: true };
  } catch (e) {
    console.error('sendOneSignalSms exception', e);
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

    // For signup/add: ensure phone isn't already verified by someone else
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

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const code_hash = await sha256Hex(code);

    const { data: row, error: insErr } = await admin
      .from('phone_verifications')
      .insert({
        phone: e164,
        code,            // legacy column still NOT NULL-safe; we now also store hash
        code_hash,
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

    const send = await sendOneSignalSms(e164, code);
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
