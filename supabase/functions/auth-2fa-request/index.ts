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
    const { email, challengeId, oauthSession } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string' || email.length > 320) {
      return jsonResponse({ error: 'invalid_email' }, 400);
    }
    if (challengeId != null && typeof challengeId !== 'string') {
      return jsonResponse({ error: 'invalid_challenge' }, 400);
    }
    const normalized = email.trim().toLowerCase();

    const admin = getServiceClient();
    // Resolve user via profiles.email first (works regardless of how many auth
    // users exist). Fall back to a paginated listUsers scan only if no profile
    // row matches — that avoids the silent bypass for users created past page 1.
    let userId: string | null = null;
    {
      const { data: prof } = await admin
        .from('profiles')
        .select('user_id')
        .eq('email', normalized)
        .maybeSingle();
      userId = prof?.user_id ?? null;
    }
    if (!userId) {
      // Fallback: paginate through admin.listUsers (max 5 pages = 1000 users).
      for (let page = 1; page <= 5 && !userId; page++) {
        const { data: users, error: lookupErr } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (lookupErr) break;
        const u = users.users.find(uu => (uu.email ?? '').toLowerCase() === normalized);
        if (u) userId = u.id;
        if ((users.users?.length ?? 0) < 200) break;
      }
    }

    // Always respond OK (don't leak existence) — but only act if user exists & has 2FA on
    if (!userId) {
      return jsonResponse({ ok: true, requires2fa: false });
    }

    const { data: settings } = await admin
      .from('user_2fa_settings')
      .select('email_2fa_enabled')
      .eq('user_id', userId)
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

    const reusableSession = challengeId
      ? ((await admin
        .from('auth_challenges')
        .select('metadata')
        .eq('id', challengeId)
        .eq('user_id', userId)
        .eq('challenge_type', 'email_2fa')
        .eq('status', 'pending')
        .maybeSingle()).data?.metadata as Record<string, any> | null)?.session
      : null;

    // Invalidate previous pending email_2fa challenges for this user, then
    // create a fresh challenge id so the newly emailed code is the only valid one.
    await admin
      .from('auth_challenges')
      .update({ status: 'expired' })
      .eq('user_id', userId)
      .eq('challenge_type', 'email_2fa')
      .eq('status', 'pending');

    const { data: chal, error: insErr } = await admin
      .from('auth_challenges')
      .insert({
        user_id: userId,
        email: normalized,
        challenge_type: 'email_2fa',
        code_hash: codeHash,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        metadata: reusableSession?.access_token && reusableSession?.refresh_token
          ? { ip, ua, device, geo, session: reusableSession }
          : { ip, ua, device, geo },
      })
      .select('id, expires_at')
      .single();
    if (insErr || !chal) return jsonResponse({ error: 'create_challenge_failed' }, 500);

    const sendResult = await sendTransactional('login-verification', normalized, {
      code,
      ip,
      city: geo.city,
      country: geo.country,
      device,
    }, `2fa-${chal.id}`);

    if (!sendResult.ok) {
      await admin.from('auth_challenges').delete().eq('id', chal.id);
      return jsonResponse({ ok: false, error: 'email_failed', detail: sendResult.error }, 502);
    }

    return jsonResponse({ ok: true, requires2fa: true, challengeId: chal.id, expiresAt: chal.expires_at });
  } catch (e) {
    console.error('auth-2fa-request error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
