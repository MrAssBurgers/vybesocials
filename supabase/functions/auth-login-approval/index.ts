// Login approval — Instagram-style "Was this you?" prompt.
//   POST { action: 'request', email }                       -> creates a pending approval challenge tied to the new device
//   POST { action: 'poll', challengeId }                    -> signed-out device polls for approval status
//   POST { action: 'respond', challengeId, intent }         -> [authenticated] approve or deny from a trusted device
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
  getClientIp, parseUserAgent, geolocateIp,
  sha256Hex, generate6DigitCode,
} from '../_shared/security.ts';
import { sendLoginVerificationEmail } from '../_shared/loginVerificationEmail.ts';

const TTL_MS = 5 * 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const admin = getServiceClient();

    if (action === 'request') {
      const { email } = body;
      if (!email || typeof email !== 'string') return jsonResponse({ error: 'invalid_email' }, 400);
      const normalized = email.trim().toLowerCase();

      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      let user = users?.users.find(u => (u.email ?? '').toLowerCase() === normalized) ?? null;
      if (!user) {
        // Fallback to profiles.email lookup so users created past page 1 still gate.
        const { data: prof } = await admin
          .from('profiles')
          .select('user_id')
          .eq('email', normalized)
          .maybeSingle();
        if (prof?.user_id) user = { id: prof.user_id } as any;
      }
      if (!user) return jsonResponse({ ok: true, requiresApproval: false });

      const { data: settings } = await admin
        .from('user_2fa_settings')
        .select('login_approvals_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!settings?.login_approvals_enabled) {
        return jsonResponse({ ok: true, requiresApproval: false });
      }

      const ip = getClientIp(req);
      const ua = req.headers.get('user-agent');
      const device = parseUserAgent(ua);
      const geo = await geolocateIp(ip);

      // Smart-gate: skip approval if the user has no other live device that
      // could actually answer the prompt. First-time sign-ins or users whose
      // sessions were all revoked just proceed — the email 2FA toggle still
      // applies independently.
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString();
      const { count: liveSessions } = await admin
        .from('user_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .gte('last_seen_at', sixtyDaysAgo);
      if ((liveSessions ?? 0) === 0) {
        return jsonResponse({ ok: true, requiresApproval: false });
      }

      const { data: chal, error } = await admin.from('auth_challenges').insert({
        user_id: user.id,
        email: normalized,
        challenge_type: 'login_approval',
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        metadata: { ip, ua, device, geo },
      }).select('id').single();
      if (error || !chal) return jsonResponse({ error: 'create_failed' }, 500);


      // Fire-and-forget push to wake any trusted device (web/Despia/native).
      try {
        const where = [geo?.city, geo?.country].filter(Boolean).join(', ') || ip || 'Unknown location';
        const deviceLabel = (device as any)?.label || (device as any)?.os || (device as any)?.browser || 'Unknown device';
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            userId: user.id,
            title: 'Approve sign-in?',
            body: `${deviceLabel} · ${where}`,
            url: `/?login-approval=${chal.id}`,
            tag: `vybe-login-approval-${chal.id}`,
            type: 'general',
            data: { challengeId: chal.id, kind: 'login_approval' },
          }),
        }).catch(() => {});
      } catch { /* best-effort */ }

      return jsonResponse({ ok: true, requiresApproval: true, challengeId: chal.id });
    }

    if (action === 'poll') {
      const { challengeId } = body;
      if (!challengeId) return jsonResponse({ error: 'invalid_input' }, 400);
      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, status, expires_at, metadata')
        .eq('id', challengeId)
        .eq('challenge_type', 'login_approval')
        .maybeSingle();
      if (!chal) return jsonResponse({ status: 'not_found' });
      if (new Date(chal.expires_at).getTime() < Date.now() && chal.status === 'pending') {
        return jsonResponse({ status: 'expired' });
      }
      // Hand back the stored session ONCE on approval, then scrub it so it
      // can't be replayed by a second polling client.
      if (chal.status === 'approved') {
        const meta = (chal.metadata as Record<string, any>) || {};
        const session = meta.session;
        if (session) {
          const scrubbed = { ...meta };
          delete scrubbed.session;
          await admin.from('auth_challenges')
            .update({ metadata: scrubbed })
            .eq('id', chal.id);
        }
        return jsonResponse({ status: 'approved', session: session ?? null });
      }
      return jsonResponse({ status: chal.status });
    }

    if (action === 'deny_self') {
      // Unauthenticated "This wasn't me" — flips the challenge to denied so the
      // pending session is never handed out. No proof beyond knowing the
      // challengeId, but the row is single-use and TTL-bound.
      const { challengeId } = body;
      if (!challengeId) return jsonResponse({ error: 'invalid_input' }, 400);
      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, status, metadata')
        .eq('id', challengeId)
        .eq('challenge_type', 'login_approval')
        .maybeSingle();
      if (!chal) return jsonResponse({ ok: true });
      if (chal.status === 'pending') {
        const meta = (chal.metadata as Record<string, any>) || {};
        const scrubbed = { ...meta };
        delete scrubbed.session;
        await admin.from('auth_challenges').update({
          status: 'denied',
          consumed_at: new Date().toISOString(),
          metadata: scrubbed,
        }).eq('id', chal.id);
      }
      return jsonResponse({ ok: true });
    }

    if (action === 'respond') {
      const user = await getUserFromAuthHeader(req);
      if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

      const { challengeId, intent } = body;
      if (!challengeId || (intent !== 'approve' && intent !== 'deny')) {
        return jsonResponse({ error: 'invalid_input' }, 400);
      }

      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, user_id, status, expires_at, metadata')
        .eq('id', challengeId)
        .eq('challenge_type', 'login_approval')
        .maybeSingle();
      if (!chal) return jsonResponse({ error: 'not_found' }, 404);
      if (chal.user_id !== user.id) return jsonResponse({ error: 'forbidden' }, 403);
      if (chal.status !== 'pending') return jsonResponse({ error: 'already_resolved' }, 400);
      if (new Date(chal.expires_at).getTime() < Date.now()) {
        await admin.from('auth_challenges').update({ status: 'expired' }).eq('id', chal.id);
        return jsonResponse({ error: 'expired' }, 400);
      }

      const newStatus = intent === 'approve' ? 'approved' : 'denied';
      const meta = (chal.metadata as Record<string, any>) || {};
      const session = newStatus === 'approved' ? (meta.session ?? null) : null;
      // Scrub the session from metadata so it can't be replayed via poll.
      const scrubbed = { ...meta };
      delete scrubbed.session;
      await admin.from('auth_challenges').update({
        status: newStatus,
        consumed_at: new Date().toISOString(),
        metadata: scrubbed,
      }).eq('id', chal.id);

      // Instant broadcast carrying the session so the waiting device finalizes
      // without an extra poll round-trip.
      try {
        const ch = admin.channel(`login-approval:${chal.id}`);
        await ch.send({
          type: 'broadcast',
          event: 'resolved',
          payload: { status: newStatus, challengeId: chal.id, session },
        });
        await admin.removeChannel(ch);
      } catch { /* best-effort */ }

      return jsonResponse({ ok: true, status: newStatus });
    }

    // Fallback: trusted device unreachable — email a 6-digit code instead.
    // Transfers the pending session from the approval challenge into a fresh
    // email_2fa challenge and expires the original approval.
    if (action === 'switch_to_code') {
      const { challengeId } = body;
      if (!challengeId) return jsonResponse({ error: 'invalid_input' }, 400);
      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, user_id, email, status, expires_at, metadata')
        .eq('id', challengeId)
        .eq('challenge_type', 'login_approval')
        .maybeSingle();
      if (!chal) return jsonResponse({ ok: false, error: 'not_found' }, 200);
      if (chal.status !== 'pending') return jsonResponse({ ok: false, error: 'already_resolved' }, 200);
      if (new Date(chal.expires_at).getTime() < Date.now()) {
        return jsonResponse({ ok: false, error: 'expired' }, 200);
      }
      const meta = (chal.metadata as Record<string, any>) || {};
      const session = meta.session;
      if (!session?.access_token || !session?.refresh_token) {
        return jsonResponse({ ok: false, error: 'no_session' }, 200);
      }

      const code = generate6DigitCode();
      const codeHash = await sha256Hex(code);

      // Expire any other pending email_2fa challenges for this user.
      await admin
        .from('auth_challenges')
        .update({ status: 'expired' })
        .eq('user_id', chal.user_id)
        .eq('challenge_type', 'email_2fa')
        .eq('status', 'pending');

      const ip = meta.ip ?? getClientIp(req);
      const device = meta.device ?? parseUserAgent(req.headers.get('user-agent'));
      const geo = meta.geo ?? { city: null, country: null };

      const { data: codeChal, error: insErr } = await admin
        .from('auth_challenges')
        .insert({
          user_id: chal.user_id,
          email: chal.email,
          challenge_type: 'email_2fa',
          code_hash: codeHash,
          expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
          metadata: { ip, device, geo, session },
        })
        .select('id, expires_at')
        .single();
      if (insErr || !codeChal) {
        console.error('switch_to_code create failed', insErr);
        return jsonResponse({ ok: false, error: 'create_failed' }, 200);
      }

      const sendResult = await sendLoginVerificationEmail({
        recipient: chal.email!,
        code,
        ip,
        city: geo?.city,
        country: geo?.country,
        device,
        idempotencyKey: `2fa-${codeChal.id}`,
      });

      if (!sendResult.ok) {
        await admin.from('auth_challenges').delete().eq('id', codeChal.id);
        return jsonResponse({ ok: false, error: 'email_failed', detail: sendResult.error }, 200);
      }

      // Scrub session from the now-orphaned approval challenge so it can't be
      // replayed, and mark it expired.
      const scrubbed = { ...meta };
      delete scrubbed.session;
      await admin.from('auth_challenges').update({
        status: 'expired',
        metadata: scrubbed,
      }).eq('id', chal.id);

      return jsonResponse({
        ok: true,
        challengeId: codeChal.id,
        expiresAt: codeChal.expires_at,
        email: chal.email,
      });
    }

    // SMS fallback — text a code to the user's verified phone number via Twilio
    // Verify. Transfers the pending session into a fresh phone_2fa challenge
    // and expires the original approval.
    if (action === 'switch_to_sms') {
      const { challengeId } = body;
      if (!challengeId) return jsonResponse({ error: 'invalid_input' }, 400);
      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, user_id, email, status, expires_at, metadata')
        .eq('id', challengeId)
        .eq('challenge_type', 'login_approval')
        .maybeSingle();
      if (!chal) return jsonResponse({ ok: false, error: 'not_found' }, 200);
      if (chal.status !== 'pending') return jsonResponse({ ok: false, error: 'already_resolved' }, 200);
      if (new Date(chal.expires_at).getTime() < Date.now()) {
        return jsonResponse({ ok: false, error: 'expired' }, 200);
      }
      const meta = (chal.metadata as Record<string, any>) || {};
      const session = meta.session;
      if (!session?.access_token || !session?.refresh_token) {
        return jsonResponse({ ok: false, error: 'no_session' }, 200);
      }

      const { data: prof } = await admin
        .from('profiles')
        .select('phone_number, phone_verified')
        .eq('user_id', chal.user_id)
        .maybeSingle();
      const phone = prof?.phone_number;
      if (!phone || !prof?.phone_verified) {
        return jsonResponse({ ok: false, error: 'no_verified_phone' }, 200);
      }

      const startRes = await admin.functions.invoke('phone-verify-request', {
        body: { phone, purpose: 'login', userId: chal.user_id },
      });
      const startData = (startRes.data as any) || {};
      if (startRes.error || startData.ok === false || !startData.challengeId) {
        const reason = startData.error || (startRes.error as any)?.message || 'sms_send_failed';
        return jsonResponse({ ok: false, error: reason }, 200);
      }

      const { data: phoneChal, error: insErr } = await admin
        .from('auth_challenges')
        .insert({
          user_id: chal.user_id,
          email: chal.email,
          challenge_type: 'phone_2fa',
          expires_at: startData.expiresAt ?? new Date(Date.now() + CODE_TTL_MS).toISOString(),
          metadata: {
            ip: meta.ip, device: meta.device, geo: meta.geo,
            session,
            phone_verification_id: startData.challengeId,
            phone,
          },
        })
        .select('id, expires_at')
        .single();
      if (insErr || !phoneChal) {
        console.error('switch_to_sms create failed', insErr);
        return jsonResponse({ ok: false, error: 'create_failed' }, 200);
      }

      const scrubbed = { ...meta };
      delete scrubbed.session;
      await admin.from('auth_challenges').update({
        status: 'expired',
        metadata: scrubbed,
      }).eq('id', chal.id);

      const masked = phone.length > 4 ? phone.slice(0, 3) + '••••' + phone.slice(-2) : '••••';
      return jsonResponse({
        ok: true,
        challengeId: phoneChal.id,
        expiresAt: phoneChal.expires_at,
        phoneMasked: masked,
      });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);

  } catch (e) {
    console.error('auth-login-approval error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
