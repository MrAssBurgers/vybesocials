// Passkey login — request authentication options.
//   POST { email? }  -> { ok, options, challengeId }
// When called WITHOUT an email, returns discoverable-credential options
// (Discord/Apple-style) so the browser shows its native passkey picker.
import {
  corsHeaders, jsonResponse, getServiceClient,
} from '../_shared/security.ts';
import { rpIdFor } from '../_shared/passkey-rp.ts';
import { generateAuthenticationOptions } from 'npm:@simplewebauthn/server@10.0.1';

const rpId = (req: Request) => rpIdFor(req);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const body = await req.json().catch(() => ({} as any));
    const email = typeof body?.email === 'string' && body.email.trim() ? body.email.trim().toLowerCase() : null;

    const admin = getServiceClient();

    let userId: string | null = null;
    let allowCredentials: { id: string; transports?: any }[] | undefined = undefined;

    if (email) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const user = users?.users.find(u => (u.email ?? '').toLowerCase() === email);
      if (!user) return jsonResponse({ ok: false });
      userId = user.id;

      const { data: keys } = await admin
        .from('user_passkeys')
        .select('credential_id, transports')
        .eq('user_id', user.id);
      if (!keys || keys.length === 0) return jsonResponse({ ok: false });
      allowCredentials = keys.map((k: any) => ({ id: k.credential_id, transports: k.transports || undefined }));
    }
    // else: discoverable-credential flow — no allowCredentials, browser picks.

    const options = await generateAuthenticationOptions({
      rpID: rpId(req),
      userVerification: 'preferred',
      ...(allowCredentials ? { allowCredentials } : {}),
    });

    const { data: chal, error } = await admin.from('auth_challenges').insert({
      user_id: userId,
      email,
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
