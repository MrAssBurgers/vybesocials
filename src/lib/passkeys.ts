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
  // Inside the Despia shell, use the native Storage Vault biometric path.
  if (isDespiaShell()) {
    await registerDespiaDevicePasskey();
    return;
  }

  if (!passkeysSupported()) throw new Error('Passkeys are not supported on this device');

  const { data: optsRes, error: optsErr } = await supabase.functions.invoke('auth-passkey-register-options', {});
  if (optsErr || !(optsRes as any)?.options) throw new Error('Could not start registration');

  let credential;
  try {
    credential = await startRegistration((optsRes as any).options);
  } catch (e: any) {
    throw classifyPasskeyError(e);
  }

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
