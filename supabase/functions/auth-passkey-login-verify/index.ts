// Passkey login verification — on success, mints a magic link the client
// follows to obtain a Supabase session.
// POST body: { challengeId, credential } -> { ok, actionLink }
import {
  corsHeaders, jsonResponse, getServiceClient,
} from '../_shared/security.ts';
import { verifyAuthenticationResponse } from 'https://esm.sh/@simplewebauthn/server@10.0.1?target=deno';

function rpId(req: Request): string {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname || 'vybehub.app'; } catch { return 'vybehub.app'; }
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { challengeId, credential } = await req.json().catch(() => ({}));
    if (!challengeId || !credential) return jsonResponse({ error: 'invalid_input' }, 400);

    const admin = getServiceClient();
    const { data: chal } = await admin
      .from('auth_challenges')
      .select('id, user_id, email, code_hash, status, expires_at')
      .eq('id', challengeId)
      .eq('challenge_type', 'passkey_login')
      .maybeSingle();
    if (!chal) return jsonResponse({ error: 'not_found' }, 404);
    if (chal.status !== 'pending') return jsonResponse({ error: 'already_used' }, 400);
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 400);
    }

    // Look up the credential. For discoverable (usernameless) flows the
    // challenge has no user_id — resolve the user from the passkey itself.
    const credentialIdB64 = credential.id || credential.rawId;
    const pkQuery = admin
      .from('user_passkeys')
      .select('id, user_id, credential_id, public_key, counter, transports')
      .eq('credential_id', credentialIdB64);
    const { data: pk } = chal.user_id
      ? await pkQuery.eq('user_id', chal.user_id).maybeSingle()
      : await pkQuery.maybeSingle();
    if (!pk) return jsonResponse({ error: 'unknown_credential' }, 400);

    // Resolve email if it wasn't pinned at challenge creation.
    let resolvedEmail = chal.email as string | null;
    if (!resolvedEmail) {
      const { data: u } = await admin.auth.admin.getUserById(pk.user_id);
      resolvedEmail = u?.user?.email ?? null;
    }

    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: chal.code_hash!,
      expectedOrigin: req.headers.get('origin') || '',
      expectedRPID: rpId(req),
      credential: {
        id: pk.credential_id,
        publicKey: b64ToBytes(pk.public_key),
        counter: Number(pk.counter || 0),
        transports: pk.transports || undefined,
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return jsonResponse({ error: 'verification_failed' }, 400);
    }

    await admin.from('user_passkeys')
      .update({ counter: verification.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
      .eq('id', pk.id);

    await admin.from('auth_challenges')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', chal.id);

    if (!resolvedEmail) return jsonResponse({ error: 'missing_email' }, 500);

    // Mint a magic link for the verified user
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: resolvedEmail,
      options: { redirectTo: `${req.headers.get('origin') || 'https://vybehub.app'}/auth/callback` },
    });
    if (error || !data?.properties?.action_link) {
      return jsonResponse({ error: 'mint_failed' }, 500);
    }

    return jsonResponse({ ok: true, actionLink: data.properties.action_link });
  } catch (e) {
    console.error('passkey-login-verify error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
