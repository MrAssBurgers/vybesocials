// Passkey login — request authentication options for an email.
// POST  body: { email }  -> { ok, options, challengeId } | { ok: false }
import {
  corsHeaders, jsonResponse, getServiceClient,
} from '../_shared/security.ts';
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@10.0.1';

function rpId(req: Request): string {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname || 'vybehub.app'; } catch { return 'vybehub.app'; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const { email } = await req.json().catch(() => ({}));
    if (!email || typeof email !== 'string') return jsonResponse({ error: 'invalid_email' }, 400);

    const admin = getServiceClient();
    const normalized = email.trim().toLowerCase();
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const user = users?.users.find(u => (u.email ?? '').toLowerCase() === normalized);
    if (!user) return jsonResponse({ ok: false }); // don't leak existence

    const { data: keys } = await admin
      .from('user_passkeys')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    if (!keys || keys.length === 0) return jsonResponse({ ok: false });

    const options = await generateAuthenticationOptions({
      rpID: rpId(req),
      userVerification: 'preferred',
      allowCredentials: keys.map((k: any) => ({
        id: k.credential_id,
        transports: k.transports || undefined,
      })),
    });

    const { data: chal, error } = await admin.from('auth_challenges').insert({
      user_id: user.id,
      email: normalized,
      challenge_type: 'passkey_login',
      code_hash: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    }).select('id').single();
    if (error || !chal) return jsonResponse({ error: 'create_failed' }, 500);

    return jsonResponse({ ok: true, options, challengeId: chal.id });
  } catch (e) {
    console.error('passkey-login-options error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
