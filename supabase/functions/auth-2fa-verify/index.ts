// Verifies an email 2FA code against a stored challenge.
// On success: marks challenge consumed and returns OK so the client
// can proceed with the already-completed Supabase session.
import {
  corsHeaders, jsonResponse, getServiceClient, sha256Hex,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { challengeId, code } = await req.json().catch(() => ({}));
    if (!challengeId || !code || typeof code !== 'string') {
      return jsonResponse({ error: 'invalid_input' }, 400);
    }
    const cleaned = code.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleaned)) return jsonResponse({ error: 'invalid_code_format' }, 400);

    const admin = getServiceClient();
    const { data: chal } = await admin
      .from('auth_challenges')
      .select('id, user_id, code_hash, status, expires_at')
      .eq('id', challengeId)
      .eq('challenge_type', 'email_2fa')
      .maybeSingle();
    if (!chal) return jsonResponse({ error: 'challenge_not_found' }, 404);
    if (chal.status !== 'pending') return jsonResponse({ error: 'challenge_used' }, 400);
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      await admin.from('auth_challenges').update({ status: 'expired' }).eq('id', chal.id);
      return jsonResponse({ error: 'challenge_expired' }, 400);
    }

    const incomingHash = await sha256Hex(cleaned);
    if (incomingHash !== chal.code_hash) {
      return jsonResponse({ error: 'wrong_code' }, 400);
    }

    await admin
      .from('auth_challenges')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', chal.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('auth-2fa-verify error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
