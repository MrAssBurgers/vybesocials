// Generates a 6-digit email 2FA code, stores its hash in auth_challenges,
// and queues the verification email. Called from the login flow AFTER
// password/OAuth has succeeded and we want a second factor.
import {
  corsHeaders, jsonResponse, getServiceClient, getClientIp, parseUserAgent,
  geolocateIp, sha256Hex, generate6DigitCode, sendTransactional,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string' || email.length > 320) {
      return jsonResponse({ error: 'invalid_email' }, 400);
    }
    const normalized = email.trim().toLowerCase();

    const admin = getServiceClient();
    // Find the user by email (admin API)
    const { data: users, error: lookupErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (lookupErr) return jsonResponse({ error: 'lookup_failed' }, 500);
    const user = users.users.find(u => (u.email ?? '').toLowerCase() === normalized);

    // Always respond OK (don't leak existence) — but only act if user exists & has 2FA on
    if (!user) {
      return jsonResponse({ ok: true, requires2fa: false });
    }

    const { data: settings } = await admin
      .from('user_2fa_settings')
      .select('email_2fa_enabled')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!settings?.email_2fa_enabled) {
      return jsonResponse({ ok: true, requires2fa: false });
    }

    const code = generate6DigitCode();
    const codeHash = await sha256Hex(code);
    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent');
    const device = parseUserAgent(ua);
    const geo = await geolocateIp(ip);

    // Invalidate previous pending email_2fa challenges for this user
    await admin
      .from('auth_challenges')
      .update({ status: 'expired' })
      .eq('user_id', user.id)
      .eq('challenge_type', 'email_2fa')
      .eq('status', 'pending');

    const { data: chal, error: insErr } = await admin
      .from('auth_challenges')
      .insert({
        user_id: user.id,
        email: normalized,
        challenge_type: 'email_2fa',
        code_hash: codeHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        metadata: { ip, ua, device, geo },
      })
      .select('id')
      .single();
    if (insErr || !chal) return jsonResponse({ error: 'create_challenge_failed' }, 500);

    await sendTransactional('login-verification', normalized, {
      code,
      ip,
      city: geo.city,
      country: geo.country,
      device,
    }, `2fa-${chal.id}`);

    return jsonResponse({ ok: true, requires2fa: true, challengeId: chal.id });
  } catch (e) {
    console.error('auth-2fa-request error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
