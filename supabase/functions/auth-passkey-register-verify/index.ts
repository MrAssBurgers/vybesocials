// WebAuthn / Passkey registration verification.
// POST  (authenticated)  body: { credential, deviceName? }  ->  { ok: true }
import {
  corsHeaders, jsonResponse, getServiceClient, getUserFromAuthHeader,
} from '../_shared/security.ts';
import { rpIdFor, expectedOriginsFor } from '../_shared/passkey-rp.ts';
import { verifyRegistrationResponse } from 'npm:@simplewebauthn/server@10.0.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405);

  try {
    const user = await getUserFromAuthHeader(req);
    if (!user) {
      console.warn('[passkey:register-verify] session_check_failed');
      return jsonResponse({ error: 'unauthorized', stage: 'session_check' }, 401);
    }
    console.log('[passkey:register-verify] session_check_ok', { userId: user.id });

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
    if (!chal) {
      console.warn('[passkey:register-verify] no_challenge', { userId: user.id });
      return jsonResponse({ error: 'no_challenge', stage: 'challenge_lookup' }, 400);
    }
    if (new Date(chal.expires_at).getTime() < Date.now()) {
      console.warn('[passkey:register-verify] challenge_expired', { userId: user.id });
      return jsonResponse({ error: 'expired', stage: 'challenge_lookup' }, 400);
    }

    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: chal.code_hash!,
      expectedOrigin: expectedOriginsFor(req),
      expectedRPID: rpIdFor(req),
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      console.warn('[passkey:register-verify] verification_failed', { userId: user.id });
      return jsonResponse({ error: 'verification_failed', stage: 'verify' }, 400);
    }
    console.log('[passkey:register-verify] verify_ok', { userId: user.id });

    const info = verification.registrationInfo;
    const credentialIdB64 = btoa(String.fromCharCode(...new Uint8Array(info.credential.id as any)));
    const publicKeyB64 = btoa(String.fromCharCode(...new Uint8Array(info.credential.publicKey)));

    // Reject duplicate credential_id with a friendly error so the client can
    // show "Passkey already registered" instead of a generic 500.
    const { data: dup } = await admin
      .from('user_passkeys')
      .select('id, user_id')
      .eq('credential_id', credentialIdB64)
      .maybeSingle();
    if (dup) {
      const sameUser = dup.user_id === user.id;
      console.warn('[passkey:register-verify] duplicate_credential', { userId: user.id, sameUser });
      return jsonResponse({
        error: sameUser ? 'already_registered' : 'credential_in_use',
        stage: 'db_insert',
      }, 409);
    }

    const { error: insErr } = await admin.from('user_passkeys').insert({
      user_id: user.id,
      credential_id: credentialIdB64,
      public_key: publicKeyB64,
      counter: info.credential.counter ?? 0,
      transports: info.credential.transports ?? [],
      device_name: deviceName || 'Passkey',
    });
    if (insErr) {
      console.error('[passkey:register-verify] db_insert_failed', insErr);
      return jsonResponse({ error: 'save_failed', stage: 'db_insert', message: insErr.message }, 500);
    }
    console.log('[passkey:register-verify] db_insert_ok', { userId: user.id });

    await admin.from('auth_challenges')
      .update({ status: 'consumed', consumed_at: new Date().toISOString() })
      .eq('id', chal.id);

    return jsonResponse({ ok: true });
  } catch (e) {
    console.error('[passkey:register-verify] error', e);
    return jsonResponse({ error: 'server_error', message: String(e) }, 500);
  }
});
