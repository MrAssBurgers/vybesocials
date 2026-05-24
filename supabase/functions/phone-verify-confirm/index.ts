// Confirms a 6-digit SMS code against a stored challenge.
// On success: marks consumed, and (for signup/add/change) stamps the user's
// profile with the verified phone + SHA-256 hash so contact-matching works.
import { corsHeaders, jsonResponse, getServiceClient, sha256Hex, getUserFromAuthHeader } from '../_shared/security.ts';

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
      .from('phone_verifications')
      .select('id, user_id, phone, code, code_hash, purpose, expires_at, consumed_at, attempts')
      .eq('id', challengeId)
      .maybeSingle();
    if (!chal) return jsonResponse({ error: 'challenge_not_found' }, 404);
    if (chal.consumed_at) return jsonResponse({ error: 'challenge_used' }, 400);
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'challenge_expired' }, 400);
    }
    if ((chal.attempts ?? 0) >= 5) {
      return jsonResponse({ error: 'too_many_attempts' }, 429);
    }

    const incomingHash = await sha256Hex(cleaned);
    const matches = (chal.code_hash && incomingHash === chal.code_hash) || (chal.code && cleaned === chal.code);
    if (!matches) {
      await admin.from('phone_verifications').update({ attempts: (chal.attempts ?? 0) + 1 }).eq('id', chal.id);
      return jsonResponse({ error: 'wrong_code' }, 400);
    }

    await admin.from('phone_verifications')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', chal.id);

    if (chal.purpose === 'signup' || chal.purpose === 'add' || chal.purpose === 'change') {
      // Need the authed user to stamp profile.
      const authedUser = await getUserFromAuthHeader(req);
      const userId = authedUser?.id || chal.user_id;
      if (!userId) {
        return jsonResponse({ ok: true, requireAuth: true });
      }
      const phoneHash = await sha256Hex(chal.phone.toLowerCase());
      const { error: upErr } = await admin
        .from('profiles')
        .update({
          phone_number: chal.phone,
          phone_verified: true,
          phone_e164_sha256: phoneHash,
        })
        .eq('user_id', userId);
      if (upErr) {
        console.error('profile phone update failed', upErr);
        return jsonResponse({ error: 'profile_update_failed' }, 500);
      }
    }

    return jsonResponse({ ok: true, phone: chal.phone });
  } catch (e) {
    console.error('phone-verify-confirm error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
