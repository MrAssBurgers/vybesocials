import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';

export const passkeysSupported = (): boolean => {
  try { return browserSupportsWebAuthn(); } catch { return false; }
};

/**
 * Register a new passkey for the currently signed-in user.
 * Throws on failure with a user-friendly message.
 */
export async function registerPasskey(deviceName?: string): Promise<void> {
  if (!passkeysSupported()) throw new Error('Passkeys are not supported on this device');

  const { data: optsRes, error: optsErr } = await supabase.functions.invoke('auth-passkey-register-options', {});
  if (optsErr || !(optsRes as any)?.options) throw new Error('Could not start registration');

  const credential = await startRegistration((optsRes as any).options);

  const { data: verifyRes, error: verifyErr } = await supabase.functions.invoke('auth-passkey-register-verify', {
    body: { credential, deviceName },
  });
  if (verifyErr || (verifyRes as any)?.error) {
    throw new Error('Passkey registration failed');
  }
}

/**
 * Sign in with a passkey by email. On success returns an action_link the
 * caller must navigate to (it completes the Supabase session via the
 * /auth/callback handler).
 *
 * Returns null when the user has no passkeys registered (caller should
 * fall back to password). Throws on real failures.
 */
export async function signInWithPasskey(email?: string): Promise<string | null> {
  if (!passkeysSupported()) return null;

  const { data: optsRes, error: optsErr } = await supabase.functions.invoke('auth-passkey-login-options', {
    body: email ? { email } : {},
  });
  if (optsErr) throw new Error('Could not start passkey sign-in');
  if (!(optsRes as any)?.ok) return null;

  const credential = await startAuthentication((optsRes as any).options);

  const { data: verifyRes, error: verifyErr } = await supabase.functions.invoke('auth-passkey-login-verify', {
    body: { challengeId: (optsRes as any).challengeId, credential },
  });
  if (verifyErr || !(verifyRes as any)?.actionLink) {
    throw new Error('Passkey verification failed');
  }
  return (verifyRes as any).actionLink as string;
}
