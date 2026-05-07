// QR quick sign-in handshake.
//   POST { action: 'create' }                              -> creates a new pending QR challenge, returns { nonce }
//   POST { action: 'poll', nonce }                         -> polls for status (pending|approved|denied|expired)
//   POST { action: 'claim', nonce, intent: 'approve'|'deny' } [authenticated]  -> signed-in device approves the QR
//   POST { action: 'redeem', nonce }                       -> signed-out device exchanges approved nonce for a session
//
// Flow:
//   1. Signed-out device calls 'create', renders the returned nonce as a QR.
//   2. Signed-in mobile scans the QR -> calls 'claim' with intent 'approve'.
//   3. Signed-out device polls; once approved it calls 'redeem' to mint a session.
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
  getClientIp, parseUserAgent, geolocateIp, generateNonce, sendTransactional,
} from '../_shared/security.ts';

const TTL_MS = 3 * 60 * 1000; // 3 minutes

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;
    const admin = getServiceClient();

    if (action === 'create') {
      const ip = getClientIp(req);
      const ua = req.headers.get('user-agent');
      const device = parseUserAgent(ua);
      const geo = await geolocateIp(ip);
      const nonce = generateNonce();

      const { error } = await admin.from('auth_challenges').insert({
        challenge_type: 'qr_signin',
        nonce,
        expires_at: new Date(Date.now() + TTL_MS).toISOString(),
        metadata: { ip, ua, device, geo },
      });
      if (error) return jsonResponse({ error: 'create_failed' }, 500);

      return jsonResponse({ ok: true, nonce, expiresInSec: Math.floor(TTL_MS / 1000) });
    }

    if (action === 'poll') {
      const { nonce } = body;
      if (!nonce || typeof nonce !== 'string') return jsonResponse({ error: 'invalid_input' }, 400);
      const { data: chal } = await admin
        .from('auth_challenges')
        .select('status, expires_at, user_id, email, metadata')
        .eq('nonce', nonce)
        .eq('challenge_type', 'qr_signin')
        .maybeSingle();
      if (!chal) return jsonResponse({ status: 'not_found' });
      if (new Date(chal.expires_at).getTime() < Date.now() && chal.status === 'pending') {
        return jsonResponse({ status: 'expired' });
      }
      return jsonResponse({ status: chal.status });
    }

    if (action === 'claim') {
      const user = await getUserFromAuthHeader(req);
      if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

      const { nonce, intent } = body;
      if (!nonce || typeof nonce !== 'string') return jsonResponse({ error: 'invalid_input' }, 400);
      if (intent !== 'approve' && intent !== 'deny') return jsonResponse({ error: 'invalid_intent' }, 400);

      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, status, expires_at')
        .eq('nonce', nonce)
        .eq('challenge_type', 'qr_signin')
        .maybeSingle();
      if (!chal) return jsonResponse({ error: 'not_found' }, 404);
      if (chal.status !== 'pending') return jsonResponse({ error: 'already_resolved' }, 400);
      if (new Date(chal.expires_at).getTime() < Date.now()) {
        return jsonResponse({ error: 'expired' }, 400);
      }

      const newStatus = intent === 'approve' ? 'approved' : 'denied';
      await admin.from('auth_challenges').update({
        status: newStatus,
        user_id: user.id,
        email: user.email,
        consumed_at: intent === 'deny' ? new Date().toISOString() : null,
      }).eq('id', chal.id);

      return jsonResponse({ ok: true, status: newStatus });
    }

    if (action === 'redeem') {
      const { nonce } = body;
      if (!nonce || typeof nonce !== 'string') return jsonResponse({ error: 'invalid_input' }, 400);

      const { data: chal } = await admin
        .from('auth_challenges')
        .select('id, status, user_id, email, expires_at, consumed_at')
        .eq('nonce', nonce)
        .eq('challenge_type', 'qr_signin')
        .maybeSingle();
      if (!chal) return jsonResponse({ error: 'not_found' }, 404);
      if (chal.status !== 'approved') return jsonResponse({ error: 'not_approved' }, 400);
      if (chal.consumed_at) return jsonResponse({ error: 'already_used' }, 400);
      if (new Date(chal.expires_at).getTime() < Date.now()) return jsonResponse({ error: 'expired' }, 400);
      if (!chal.email) return jsonResponse({ error: 'missing_email' }, 500);

      // Generate a magic link the signed-out device can navigate to
      const { data, error } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: chal.email,
        options: { redirectTo: `${req.headers.get('origin') || 'https://vybehub.app'}/auth/callback` },
      });
      if (error || !data?.properties?.action_link) {
        console.error('generateLink failed', error);
        return jsonResponse({ error: 'mint_failed' }, 500);
      }

      await admin.from('auth_challenges')
        .update({ status: 'consumed', consumed_at: new Date().toISOString() })
        .eq('id', chal.id);

      // Notify owner
      if (chal.email) {
        const time = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        await sendTransactional('new-signin', chal.email, {
          device: 'QR sign-in',
          ip: getClientIp(req),
          time,
        }, `qr-${chal.id}`);
      }

      return jsonResponse({ ok: true, actionLink: data.properties.action_link });
    }

    return jsonResponse({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('auth-qr error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
