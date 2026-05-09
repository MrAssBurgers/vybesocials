// Verifies an email 2FA code against a stored challenge.
// On success: marks the challenge consumed, atomically clears the stored
// session tokens from metadata, and returns them to the client which then
// calls supabase.auth.setSession(...) to actually sign in.
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
      .select('id, user_id, code_hash, status, expires_at, metadata')
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

    // Pull the stored session tokens, then null them out in the same row so
    // they can never be replayed.
    const meta = (chal.metadata as Record<string, any>) || {};
    const session = meta.session;
    const scrubbed = { ...meta };
    delete scrubbed.session;

    await admin
      .from('auth_challenges')
      .update({
        status: 'consumed',
        consumed_at: new Date().toISOString(),
        metadata: scrubbed,
      })
      .eq('id', chal.id);

    if (!session?.access_token || !session?.refresh_token) {
      // Older challenge predating the preauth flow — nothing we can hand back.
      return jsonResponse({ ok: true, session: null });
    }

    return jsonResponse({ ok: true, session });
  } catch (e) {
    console.error('auth-2fa-verify error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
