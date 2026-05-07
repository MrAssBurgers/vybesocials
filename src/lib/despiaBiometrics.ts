// Despia biometric authentication wrapper.
// Triggers Face ID / Touch ID / device passcode inside the Despia native shell
// and resolves a Promise based on the global callbacks the runtime invokes.
//
// Docs: https://setup.despia.com/native-features/biometrics
//
// SECURITY NOTE: This only proves the device owner is present. It does NOT
// produce a token or talk to the backend. Use it as a *gate* in front of
// existing session-protected actions (settings changes, payments, revealing
// secrets, quick app unlock), not as login by itself.

import despia from 'despia-native';

declare global {
  interface Window {
    onBioAuthSuccess?: () => void;
    onBioAuthFailure?: (errorCode: string | number, errorMessage: string) => void;
    onBioAuthUnavailable?: () => void;
  }
}

export const isDespia = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

export type BioAuthResult =
  | { ok: true }
  | { ok: false; reason: 'failed' | 'unavailable' | 'not-despia'; code?: string | number; message?: string };

let pending: ((r: BioAuthResult) => void) | null = null;

function settle(r: BioAuthResult) {
  const fn = pending;
  pending = null;
  fn?.(r);
}

/**
 * Trigger the system biometric prompt. Resolves once the native runtime fires
 * one of the three callbacks. If called outside Despia, resolves immediately
 * with `{ ok: false, reason: 'not-despia' }` so callers can fall back to a
 * password/email confirmation.
 */
export function requestBioAuth(): Promise<BioAuthResult> {
  if (!isDespia()) {
    return Promise.resolve({ ok: false, reason: 'not-despia' });
  }

  // If a previous prompt is still pending, cancel it.
  if (pending) settle({ ok: false, reason: 'failed', message: 'superseded' });

  return new Promise<BioAuthResult>((resolve) => {
    pending = resolve;

    window.onBioAuthSuccess = () => settle({ ok: true });
    window.onBioAuthFailure = (code, message) =>
      settle({ ok: false, reason: 'failed', code, message });
    window.onBioAuthUnavailable = () =>
      settle({ ok: false, reason: 'unavailable' });

    try {
      despia('bioauth://');
    } catch (e) {
      settle({ ok: false, reason: 'unavailable', message: (e as Error)?.message });
    }
  });
}

/**
 * Convenience: gate a sensitive action behind biometrics. Returns true if the
 * action should proceed. Outside Despia (or when no biometrics are enrolled),
 * returns true so the caller's normal UX flow still works — pair with your
 * own password/email confirm for stricter gating.
 */
export async function confirmWithBiometrics(opts?: { strict?: boolean }): Promise<boolean> {
  const r = await requestBioAuth();
  if (r.ok) return true;
  const reason = (r as Extract<BioAuthResult, { ok: false }>).reason;
  if (reason === 'not-despia' || reason === 'unavailable') return !opts?.strict;
  return false;
}

const BIO_PREF_KEY = 'vybe.bioauth.enabled';

export const getBioAuthPref = (): boolean => {
  try { return localStorage.getItem(BIO_PREF_KEY) === '1'; } catch { return false; }
};

export const setBioAuthPref = (on: boolean): void => {
  try { localStorage.setItem(BIO_PREF_KEY, on ? '1' : '0'); } catch { }
};
