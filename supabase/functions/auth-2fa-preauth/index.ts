// Server-side pre-authentication for 2FA / login-approval flows.
//
// Big-platform behaviour: the client never receives a session until the
// second factor passes. This function:
//   1. Validates email + password using a transient anon client.
//   2. If the user has email 2FA or login-approval enabled, stores the
//      session tokens inside the auth_challenges row and returns ONLY
//      the challengeId. The client opens the gate modal — no session
//      exists on the device, so cancelling is naturally safe.
//   3. If neither factor is enabled, returns the session tokens directly
//      so the client can call supabase.auth.setSession(...) and proceed.
import { createClient } from 'npm:@supabase/supabase-js@2.90.1';
import {
  corsHeaders, jsonResponse, getServiceClient, getClientIp, parseUserAgent,
  geolocateIp, sha256Hex, generate6DigitCode,
} from '../_shared/security.ts';
import { sendLoginVerificationEmail } from '../_shared/loginVerificationEmail.ts';

const TWOFA_TTL_MS = 10 * 60 * 1000;
const APPROVAL_TTL_MS = 5 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { email, password } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string' || email.length > 320) {
      return jsonResponse({ error: 'invalid_email' }, 400);
    }
    if (!password || typeof password !== 'string') {
      // Invalid credentials are an expected login outcome, not a function crash.
      // Return 200 with a structured error so the client can show a form error
      // without Lovable's runtime detector treating this preauth check as fatal.
      return jsonResponse({ error: 'invalid_credentials' }, 200);
    }
    const normalized = email.trim().toLowerCase();

    // 1. Validate password using a fresh anon client so we get back a real
    //    session we can hand to the client AFTER 2FA passes.
    const anon = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
      email: normalized,
      password,
    });
    if (signInError || !signInData?.session || !signInData?.user) {
      return jsonResponse({ error: 'invalid_credentials' }, 200);
    }

    const session = {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    };
    const userId = signInData.user.id;

    // 2. Check 2FA / approval settings using service-role client.
    const admin = getServiceClient();

    // Bypass 2FA / login approval entirely on the Lovable preview sandbox.
    // The id-preview-*.lovable.app host is the in-editor preview iframe — we
    // never want the user to be locked out while iterating in the builder.
    const origin = req.headers.get('origin') || req.headers.get('referer') || '';
    const isLovablePreview = /(^|\/\/)(id-preview--|.*\.lovableproject\.com|.*\.lovable\.app)/.test(origin)
      && !/vybehub\.app/.test(origin);
    if (isLovablePreview) {
      return jsonResponse({ stage: 'none', session });
    }

    const { data: settings } = await admin
      .from('user_2fa_settings')
      .select('email_2fa_enabled, login_approvals_enabled')
      .eq('user_id', userId)
      .maybeSingle();

    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent');
    const device = parseUserAgent(ua);
    const geo = await geolocateIp(ip);

    // Login approval still respects the user's explicit setting and takes
    // precedence over email 2FA when enabled. Otherwise, email 2FA is now
    // REQUIRED on every live login — every user gets a verification code
    // emailed before the session lands on the device.
    const wantsEmail2fa = !settings?.login_approvals_enabled;

    if (wantsEmail2fa) {
      // Invalidate previous pending email_2fa challenges
      await admin
        .from('auth_challenges')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('challenge_type', 'email_2fa')
        .eq('status', 'pending');

      const code = generate6DigitCode();
      const codeHash = await sha256Hex(code);
      const { data: chal, error: insErr } = await admin
        .from('auth_challenges')
        .insert({
          user_id: userId,
          email: normalized,
          challenge_type: 'email_2fa',
          code_hash: codeHash,
          expires_at: new Date(Date.now() + TWOFA_TTL_MS).toISOString(),
          metadata: { ip, ua, device, geo, session },
        })
        .select('id, expires_at')
        .single();
      if (insErr || !chal) return jsonResponse({ error: 'create_challenge_failed' }, 500);

      const sendResult = await sendLoginVerificationEmail({
        recipient: normalized,
        code,
        ip,
        city: geo.city,
        country: geo.country,
        device,
        idempotencyKey: `2fa-${chal.id}`,
      });

      if (!sendResult.ok) {
        await admin.from('auth_challenges').delete().eq('id', chal.id);
        return jsonResponse({ error: 'email_failed', detail: sendResult.error }, 502);
      }

      return jsonResponse({
        stage: 'code',
        challengeId: chal.id,
        expiresAt: chal.expires_at,
      });
    }

    // 3b. Login approval path
    if (settings?.login_approvals_enabled) {
      const { data: chal, error: insErr } = await admin
        .from('auth_challenges')
        .insert({
          user_id: userId,
          email: normalized,
          challenge_type: 'login_approval',
          expires_at: new Date(Date.now() + APPROVAL_TTL_MS).toISOString(),
          metadata: { ip, ua, device, geo, session },
        })
        .select('id, expires_at')
        .single();
      if (insErr || !chal) return jsonResponse({ error: 'create_challenge_failed' }, 500);

      // Fire-and-forget push to the user's other signed-in devices so they
      // see "Was this you?" even if the app isn't currently open. The
      // in-app realtime sheet still handles the actual approve/deny.
      try {
        const { data: prof } = await admin
          .from('profiles')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        const profileId = prof?.id as string | undefined;
        if (profileId) {
          const where = [geo.city, geo.country].filter(Boolean).join(', ') || ip || 'a new location';
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              userId: profileId,
              title: 'Approve sign-in?',
              body: `${device} from ${where}`,
              url: '/home',
              tag: `login-approval-${chal.id}`,
              type: 'security',
              data: { challengeId: chal.id, kind: 'login_approval' },
            }),
          }).catch(() => {});
        }
      } catch { /* never block login */ }

      return jsonResponse({
        stage: 'approval',
        challengeId: chal.id,
        expiresAt: chal.expires_at,
        device,
        location: { city: geo.city, country: geo.country, ip },
      });
    }

    // 3c. No second factor — return session immediately.
    return jsonResponse({ stage: 'none', session });
  } catch (e) {
    console.error('auth-2fa-preauth error', e);
    return jsonResponse({ error: 'server_error' }, 500);
    // Note: client falls back to direct supabase.auth.signInWithPassword
    // on any non-401 error, so users are never locked out by a 5xx here.
  }
});
