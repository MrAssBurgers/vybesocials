/**
 * Despia Storage Vault helpers — encrypted, biometric-gated key/value
 * storage that survives uninstall/reinstall and syncs across devices on
 * the same Apple ID / Google account.
 *
 * Inside the Despia shell we use this instead of WebAuthn because the
 * embedded Android WebView / iOS WKWebView can't reliably open the
 * system passkey sheet. Reading a `locked: true` value triggers the
 * real native Face ID / Touch ID prompt — no fake biometric UI.
 */

import { db } from '@/lib/firebase';

const DESPIA_APP_HINT = /despia|vybeapp|app\.lovable\.416714c8d0134aff984d522418a9bbc7|app\.lovable\.762a689eac3b48a59a179f1c2b5b3a2b|com\.despia\.vybe/i;

export const isDespiaShell = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return DESPIA_APP_HINT.test(navigator.userAgent || '');
};

const VAULT_REFRESH_KEY = 'vybe_refresh';
const VAULT_EMAIL_KEY = 'vybe_email';
const LOCAL_MARKER = 'vybe.despia.passkey.enrolled';

function isSuccessfulBiometricResult(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'string') return /^(true|success|ok|authenticated|verified|1)$/i.test(value);
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  return Object.values(result).some(isSuccessfulBiometricResult);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(resolve, ms)),
  ]);
}

let despiaMod: any | null = null;
async function getDespia(): Promise<any> {
  if (despiaMod) return despiaMod;
  const m = await import('despia-native');
  despiaMod = (m as any).default || m;
  return despiaMod;
}

async function setVault(key: string, value: string, locked: boolean) {
  const despia = await getDespia();
  const encoded = encodeURIComponent(value);
  await despia(`setvault://?key=${key}&value=${encoded}&locked=${locked}`);
}

async function readVault(key: string): Promise<string | null> {
  try {
    const despia = await getDespia();
    const data = await despia(`readvault://?key=${key}`, [key]);
    const raw = (data && (data as any)[key]) ?? null;
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

export function isDespiaPasskeyEnrolled(): boolean {
  try { return localStorage.getItem(LOCAL_MARKER) === '1'; } catch { return false; }
}

/**
 * Enroll the current signed-in session as a Despia "device passkey".
 * Stores the refresh token locked behind Face ID / Touch ID via Storage Vault.
 */
export async function registerDespiaDevicePasskey(): Promise<void> {
  if (!isDespiaShell()) throw new Error('Not in Despia shell');
  const { data: { session } } = await db.auth.getSession();
  if (!session?.refresh_token) throw new Error('Sign in first to add a passkey');
  const despia = await getDespia();

  try {
    const biometric = await withTimeout(
      despia('biometric://authenticate?reason=Register%20VYBE%20Passkey', ['authResult']),
      8000,
    );
    if (biometric === undefined) {
      await despia('bioauth://');
    }
    const authResult = (biometric as any)?.authResult;
    if (authResult !== undefined && !isSuccessfulBiometricResult(authResult)) {
      throw new Error('Cancelled');
    }
  } catch (error: any) {
    if (error?.message === 'Cancelled') throw error;
    await despia('bioauth://');
  }

  // Email is unlocked so the sign-in screen can pre-fill it.
  if (session.user?.email) {
    await setVault(VAULT_EMAIL_KEY, session.user.email, false);
  }
  // Refresh token is biometric-gated.
  await setVault(VAULT_REFRESH_KEY, session.refresh_token, true);
  try { localStorage.setItem(LOCAL_MARKER, '1'); } catch {}
}

export async function removeDespiaDevicePasskey(): Promise<void> {
  if (!isDespiaShell()) return;
  try { await setVault(VAULT_REFRESH_KEY, '', false); } catch {}
  try { await setVault(VAULT_EMAIL_KEY, '', false); } catch {}
  try { localStorage.removeItem(LOCAL_MARKER); } catch {}
}

/**
 * Reads the email pre-fill (no biometric prompt — value is unlocked).
 */
export async function getDespiaPasskeyEmail(): Promise<string | null> {
  if (!isDespiaShell()) return null;
  return readVault(VAULT_EMAIL_KEY);
}

/**
 * Sign in via Despia device passkey. Triggers the real Face ID / Touch ID
 * prompt; on success restores the Supabase session from the vaulted
 * refresh token. Returns true on success, false if cancelled / unavailable.
 */
export async function signInWithDespiaPasskey(): Promise<boolean> {
  if (!isDespiaShell()) return false;
  const refresh = await readVault(VAULT_REFRESH_KEY);
  if (!refresh) return false;
  const { error } = await db.auth.refreshSession({ refresh_token: refresh });
  if (error) {
    // Refresh token expired/revoked — clear marker so UI prompts re-enroll.
    try { localStorage.removeItem(LOCAL_MARKER); } catch {}
    throw new Error('Saved passkey expired — sign in with email and add it again.');
  }
  // Re-store rotated refresh token so it stays valid.
  try {
    const { data: { session } } = await db.auth.getSession();
    if (session?.refresh_token) {
      await setVault(VAULT_REFRESH_KEY, session.refresh_token, true);
    }
  } catch {}
  return true;
}
