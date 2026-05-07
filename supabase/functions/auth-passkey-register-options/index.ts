// WebAuthn / Passkey registration options.
// POST  (authenticated)  -> { options }  // PublicKeyCredentialCreationOptionsJSON
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
} from '../_shared/security.ts';
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@10.0.1';

const RP_NAME = 'VYBE';

function rpId(req: Request): string {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname || 'vybehub.app'; } catch { return 'vybehub.app'; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user || !user.email) return jsonResponse({ error: 'unauthorized' }, 401);

    const admin = getServiceClient();
    const { data: existing } = await admin
      .from('user_passkeys')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: rpId(req),
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      excludeCredentials: (existing || []).map((p: any) => ({
        id: p.credential_id,
        transports: p.transports || undefined,
      })),
    });

    // Stash the challenge for the verify step
    await admin.from('auth_challenges').insert({
      user_id: user.id,
      email: user.email,
      challenge_type: 'passkey_register',
      code_hash: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      metadata: { rpId: rpId(req) },
    });

    return jsonResponse({ ok: true, options });
  } catch (e) {
    console.error('passkey-register-options error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
