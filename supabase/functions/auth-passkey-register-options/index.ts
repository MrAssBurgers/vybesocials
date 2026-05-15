// WebAuthn / Passkey registration options.
// POST  (authenticated)  -> { options }  // PublicKeyCredentialCreationOptionsJSON
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
} from '../_shared/security.ts';
import { rpIdFor } from '../_shared/passkey-rp.ts';
import { generateRegistrationOptions } from 'npm:@simplewebauthn/server@10.0.1';

const RP_NAME = 'VYBE';
const rpId = (req: Request) => rpIdFor(req);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user || !user.email) {
      console.warn('[passkey:register-options] session_check_failed');
      return jsonResponse({ error: 'unauthorized', stage: 'session_check' }, 401);
    }
    const resolvedRpId = rpId(req);
    console.log('[passkey:register-options] session_check_ok', { userId: user.id, rpId: resolvedRpId });

    const admin = getServiceClient();
    const { data: existing } = await admin
      .from('user_passkeys')
      .select('credential_id, transports')
      .eq('user_id', user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: resolvedRpId,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
      excludeCredentials: (existing || []).map((p: any) => ({
        id: p.credential_id,
        transports: p.transports || undefined,
      })),
    });
    console.log('[passkey:register-options] options_created', { userId: user.id, existingCount: existing?.length || 0 });

    await admin.from('auth_challenges').insert({
      user_id: user.id,
      email: user.email,
      challenge_type: 'passkey_register',
      code_hash: options.challenge,
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      metadata: { rpId: resolvedRpId },
    });

    return jsonResponse({ ok: true, options });
  } catch (e) {
    console.error('[passkey:register-options] error', e);
    return jsonResponse({ error: 'server_error', message: String(e) }, 500);
  }
});
