// Login approval — Instagram-style "Was this you?" prompt.
//   POST { action: 'request', email }                       -> creates a pending approval challenge tied to the new device
//   POST { action: 'poll', challengeId }                    -> signed-out device polls for approval status
//   POST { action: 'respond', challengeId, intent }         -> [authenticated] approve or deny from a trusted device
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
  getClientIp, parseUserAgent, geolocateIp,
} from '../_shared/security.ts';

const TTL_MS = 5 * 60 * 1000;

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

      const { data: chal, error } = await admin.from('auth_challenges').insert({
        user_id: user.id,
        email: normalized,
        challenge_type: 'login_approval',
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        metadata: { ip, ua, device, geo },
      }).select('id').single();
      if (error || !chal) return jsonResponse({ error: 'create_failed' }, 500);

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
        .select('id, user_id, status, expires_at')
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
      await admin.from('auth_challenges').update({
        status: newStatus,
        consumed_at: new Date().toISOString(),
      }).eq('id', chal.id);

      return jsonResponse({ ok: true, status: newStatus });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('auth-login-approval error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
