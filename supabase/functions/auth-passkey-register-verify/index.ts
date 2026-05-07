// WebAuthn / Passkey registration verification.
// POST  (authenticated)  body: { credential, deviceName? }  ->  { ok: true }
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
} from '../_shared/security.ts';
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@10.0.1';

function rpId(req: Request): string {
  const origin = req.headers.get('origin') || '';
  try { return new URL(origin).hostname || 'vybehub.app'; } catch { return 'vybehub.app'; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) return jsonResponse({ error: 'unauthorized' }, 401);

    const { credential, deviceName } = await req.json().catch(() => ({}));
    if (!credential) return jsonResponse({ error: 'invalid_input' }, 400);

    const admin = getServiceClient();
    const { data: chal } = await admin
      .from('auth_challenges')
      .select('id, code_hash, expires_at, status')
      .eq('user_id', user.id)
      .eq('challenge_type', 'passkey_register')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!chal) return jsonResponse({ error: 'no_challenge' }, 400);
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      return jsonResponse({ error: 'expired' }, 400);
    }

    const origin = req.headers.get('origin') || '';
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: chal.code_hash!,
      expectedOrigin: origin,
      expectedRPID: rpId(req),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return jsonResponse({ error: 'verification_failed' }, 400);
    }

    const info = verification.registrationInfo;
    const credentialIdB64 = btoa(String.fromCharCode(...new Uint8Array(info.credential.id as any)));
    const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(info.credential.publicKey)));

    const { error: insErr } = await admin.from('user_passkeys').insert({
      user_id: user.id,
      credential_id: credentialIdB64,
      public_key: publicKeyB64,
      counter: info.credential.counter ?? 0,
      transports: info.credential.transports ?? [],
      device_name: deviceName || 'Passkey',
    });
    if (insErr) {
      console.error('insert passkey failed', insErr);
      return jsonResponse({ error: 'save_failed' }, 500);
    }

    await admin.from('auth_challenges')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', chal.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('passkey-register-verify error', e);
    return jsonResponse({ error: 'server_error' }, 500);
  }
});
