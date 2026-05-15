import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { supabase } from '@/integrations/supabase/client';
import {
  isDespiaShell,
  registerDespiaDevicePasskey,
  signInWithDespiaPasskey,
  isDespiaPasskeyEnrolled,
} from '@/lib/despiaVault';

/**
 * True when the current shell is a generic Android WebView (Despia, Median,
 * GoNative, Cordova, plain WebView). These shells often lack full Credential
 * Manager / WebAuthn support — passkeys can throw cryptic "origin"/"rpId"
 * errors instead of showing the system sheet. Used to give the user a clear
 * fix instead of a silent failure.
 */
export function isAndroidWebViewShell(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /android/i.test(ua) && /despia|vybeapp|median|gonative|; wv\)|\bwv\b/i.test(ua);
}

/**
 * Open the current app URL in the system Chrome browser via an Android intent.
 * Used as a fallback when an Android WebView shell can't open the passkey sheet.
 * Silently no-ops on non-Android.
 */
export function openInChromeFallback(path: string = '/settings'): void {
  if (typeof window === 'undefined') return;
  const ua = navigator.userAgent || '';
  if (!/android/i.test(ua)) return;
  const target = new URL(path, 'https://vybehub.app').toString();
  // Chrome intent URL — opens the URL directly in Chrome if installed.
  const intent = `intent://${target.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;end`;
  try { window.location.href = intent; } catch { window.open(target, '_blank'); }
}

export const passkeysSupported = (): boolean => {
  // Despia shell uses native Storage Vault biometrics — always supported.
  if (isDespiaShell()) return true;
  try { return browserSupportsWebAuthn(); } catch { return false; }
};

function classifyPasskeyError(e: any): Error {
  const name = e?.name || '';
  const msg = String(e?.message || '');
  if (name === 'NotAllowedError' || name === 'AbortError') {
    const err = new Error('Cancelled');
    (err as any).name = name;
    return err;
  }
  if (/security|origin|rp ?id|domain|associated|relying party|not a registered/i.test(msg)) {
    if (isAndroidWebViewShell()) {
      return new Error("This Android shell can't open passkeys. Open VYBE in Chrome (or update Android System WebView) to add a passkey, then come back.");
    }
    return new Error("This device isn't trusted for VYBE passkeys yet. Try the latest VYBE app or open vybehub.app in Chrome/Safari.");
  }
  if (/not supported|unsupported/i.test(msg)) {
    return new Error('Passkeys are not supported on this device yet.');
  }
  return new Error(msg || 'Passkey failed');
}

/**
 * Register a new passkey for the currently signed-in user.
 * Throws on failure with a user-friendly message.
 */
export async function registerPasskey(deviceName?: string): Promise<void> {
  // Despia shell: native Storage Vault biometric path.
  if (isDespiaShell()) {
    console.log('[passkey:register] stage=despia_native');
    await registerDespiaDevicePasskey();
    return;
  }

  // Stage 1 — session check. Never start registration without a real user.
  console.log('[passkey:register] stage=session_check');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    throw new Error('Sign in first to add a passkey to your account.');
  }

  if (!passkeysSupported()) {
    throw new Error('Passkeys are not supported on this device');
  }

  // Stage 2 — fetch options from server (server uses session to bind to user).
  console.log('[passkey:register] stage=options_request', { userId: session.user.id });
  const { data: optsRes, error: optsErr } = await supabase.functions.invoke('auth-passkey-register-options', {});
  if (optsErr || !(optsRes as any)?.options) {
    console.error('[passkey:register] options_failed', optsErr, optsRes);
    throw new Error('Could not start registration');
  }
  console.log('[passkey:register] stage=options_received');

  // Stage 3 — browser prompts user for biometric / security key.
  let credential;
  try {
    credential = await startRegistration((optsRes as any).options);
    console.log('[passkey:register] stage=credential_created');
  } catch (e: any) {
    console.warn('[passkey:register] credential_create_failed', e);
    throw classifyPasskeyError(e);
  }

  // Stage 4 — server verifies and stores credential bound to user_id.
  const { data: verifyRes, error: verifyErr } = await supabase.functions.invoke('auth-passkey-register-verify', {
    body: { credential, deviceName },
  });
  if (verifyErr || (verifyRes as any)?.error) {
    const code = (verifyRes as any)?.error || verifyErr?.message;
    const stage = (verifyRes as any)?.stage;
    console.error('[passkey:register] verify_failed', { code, stage, verifyErr, verifyRes });
    if (code === 'already_registered') throw new Error('This passkey is already registered to your account.');
    if (code === 'credential_in_use') throw new Error('This passkey is already in use by another account.');
    if (code === 'verification_failed') throw new Error('Passkey verification failed — domain mismatch?');
    if (code === 'expired' || code === 'no_challenge') throw new Error('Passkey request expired. Try again.');
    if (code === 'save_failed') throw new Error('Could not save passkey. Please try again.');
    throw new Error('Passkey registration failed');
  }
  console.log('[passkey:register] stage=db_insert_ok');
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
  // Despia shell: trigger native Face ID / Touch ID via Storage Vault and
  // restore the session locally. Return a sentinel string so the caller
  // navigates onward instead of treating it as "no passkey".
  if (isDespiaShell()) {
    if (!isDespiaPasskeyEnrolled()) return null;
    const ok = await signInWithDespiaPasskey();
    return ok ? '/' : null;
  }

  if (!passkeysSupported()) return null;

  const { data: optsRes, error: optsErr } = await supabase.functions.invoke('auth-passkey-login-options', {
    body: email ? { email } : {},
  });
  if (optsErr) throw new Error('Could not start passkey sign-in');
  if (!(optsRes as any)?.ok) return null;

  let credential;
  try {
    credential = await startAuthentication((optsRes as any).options);
  } catch (e: any) {
    throw classifyPasskeyError(e);
  }

  const { data: verifyRes, error: verifyErr } = await supabase.functions.invoke('auth-passkey-login-verify', {
    body: { challengeId: (optsRes as any).challengeId, credential },
  });
  if (verifyErr || !(verifyRes as any)?.actionLink) {
    throw new Error('Passkey verification failed');
  }
  return (verifyRes as any).actionLink as string;
}
