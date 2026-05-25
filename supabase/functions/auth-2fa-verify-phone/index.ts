// Verifies an SMS 2FA code against a phone_2fa auth_challenge created by
// auth-login-approval `switch_to_sms`. On success: checks the code with
// Twilio Verify, marks the challenge consumed, and returns the stored session
// tokens so the client can call supabase.auth.setSession(...).
import { corsHeaders, jsonResponse, getServiceClient } from '../_shared/security.ts';

async function twilioVerifyCheck(phone: string, code: string): Promise<{ ok: boolean; status?: string; error?: string }> {
  const sid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const service = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');
  if (!sid || !token || !service) return { ok: false, error: 'twilio_not_configured' };
  try {
    const res = await fetch(`https://verify.twilio.com/v2/Services/${service}/VerificationCheck`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, Code: code }),
    });
    const body = await res.json().catch(() => ({} as any));
    if (!res.ok) return { ok: false, status: body?.status, error: body?.message || 'check_failed' };
    return { ok: body?.status === 'approved', status: body?.status };
  } catch (e) {
    console.error('twilioVerifyCheck exception', e);
    return { ok: false, error: 'check_exception' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { challengeId, code } = await req.json().catch(() => ({}));
    if (!challengeId || !code || typeof code !== 'string') {
      return jsonResponse({ error: 'invalid_input' }, 400);
    }
    const cleaned = code.replace(/\s+/g, '');
    if (!/^\d{4,10}$/.test(cleaned)) return jsonResponse({ error: 'invalid_code_format' }, 400);

    const admin = getServiceClient();
    const { data: chal } = await admin
      .from('auth_challenges')
      .select('id, user_id, status, expires_at, metadata')
      .eq('id', challengeId)
      .eq('challenge_type', 'phone_2fa')
      .maybeSingle();
    if (!chal) return jsonResponse({ error: 'challenge_not_found' }, 404);
    if (chal.status !== 'pending') return jsonResponse({ error: 'challenge_used' }, 400);
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      await admin.from('auth_challenges').update({ status: 'expired' }).eq('id', chal.id);
      return jsonResponse({ error: 'challenge_expired' }, 400);
    }

    const meta = (chal.metadata as Record<string, any>) || {};
    const phone = meta.phone as string | undefined;
    const session = meta.session;
    if (!phone) return jsonResponse({ error: 'no_phone_on_challenge' }, 400);

    const check = await twilioVerifyCheck(phone, cleaned);
    if (!check.ok) {
      return jsonResponse({ error: 'wrong_code', status: check.status }, 400);
    }

    // Mark phone_verifications row consumed too (best-effort).
    if (meta.phone_verification_id) {
      await admin.from('phone_verifications')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', meta.phone_verification_id);
    }

    const scrubbed = { ...meta };
    delete scrubbed.session;
    await admin.from('auth_challenges').update({
      status: 'consumed',
      consumed_at: new Date().toISOString(),
      metadata: scrubbed,
    }).eq('id', chal.id);

    if (!session?.access_token || !session?.refresh_token) {
      return jsonResponse({ ok: true, session: null });
    }
    return jsonResponse({ ok: true, session });
  } catch (e) {
    console.error('auth-2fa-verify-phone error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
