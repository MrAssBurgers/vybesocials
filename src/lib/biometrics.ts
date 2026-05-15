// Biometric authentication wrapper.
// Supports three runtimes, in order of preference:
//   1. Capacitor native (iOS/Android) — uses @aparajita/capacitor-biometric-auth
//   2. Despia native shell — uses bioauth:// URL scheme
//   3. Plain web — unsupported, callers fall back gracefully.
//
// Despia docs: https://setup.despia.com/native-features/biometrics

import despia from 'despia-native';
import { Capacitor } from '@capacitor/core';
import {
  BiometricAuth,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';

declare global {
  interface Window {
    onBioAuthSuccess?: () => void;
    onBioAuthFailure?: (errorCode: string | number, errorMessage: string) => void;
    onBioAuthUnavailable?: () => void;
  }
}

export type BioAuthResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'failed' | 'unavailable' | 'not-enrolled' | 'cancelled' | 'not-despia';
      code?: string | number;
      message?: string;
    };

const isNative = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export const isDespia = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

/**
 * True when the runtime can present a biometric prompt — including the
 * "biometrics supported but not yet enrolled" case so the UI can guide the
 * user into the system enrollment flow.
 */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (isNative()) {
    try {
      const info = await BiometricAuth.checkBiometry();
      if (info.isAvailable) return true;
      // Hardware exists but no fingerprint/face enrolled — still show the toggle
      // so we can prompt the user to enroll.
      if (info.reason === BiometryErrorType.biometryNotEnrolled) return true;
      return false;
    } catch {
      return false;
    }
  }
  return isDespia();
}

// ── Despia callback bridge ────────────────────────────────────────────────────
let pending: ((r: BioAuthResult) => void) | null = null;
function settle(r: BioAuthResult) {
  const fn = pending; pending = null; fn?.(r);
}

async function requestBioAuthCapacitor(): Promise<BioAuthResult> {
  try {
    await BiometricAuth.authenticate({
      reason: 'Unlock VYBE',
      cancelTitle: 'Cancel',
      allowDeviceCredential: true,
      iosFallbackTitle: 'Use Passcode',
      androidTitle: 'Unlock VYBE',
      androidSubtitle: 'Confirm it\'s you',
      androidConfirmationRequired: false,
    });
    return { ok: true };
  } catch (e: any) {
    const code = e?.code as BiometryErrorType | undefined;
    if (code === BiometryErrorType.biometryNotEnrolled) {
      return { ok: false, reason: 'not-enrolled', code, message: e?.message };
    }
    if (
      code === BiometryErrorType.biometryNotAvailable ||
      code === BiometryErrorType.noDeviceCredential
    ) {
      return { ok: false, reason: 'unavailable', code, message: e?.message };
    }
    if (
      code === BiometryErrorType.userCancel ||
      code === BiometryErrorType.appCancel ||
      code === BiometryErrorType.systemCancel
    ) {
      return { ok: false, reason: 'cancelled', code, message: e?.message };
    }
    return { ok: false, reason: 'failed', code, message: e?.message };
  }
}

function requestBioAuthDespia(): Promise<BioAuthResult> {
  if (pending) settle({ ok: false, reason: 'failed', message: 'superseded' });
  return new Promise<BioAuthResult>((resolve) => {
    pending = resolve;
    window.onBioAuthSuccess = () => settle({ ok: true });
    window.onBioAuthFailure = (code, message) =>
      settle({ ok: false, reason: 'failed', code, message });
    window.onBioAuthUnavailable = () =>
      settle({ ok: false, reason: 'unavailable' });

    try { despia('bioauth://'); }
    catch (e) { settle({ ok: false, reason: 'unavailable', message: (e as Error)?.message }); }
  });
}

/**
 * Trigger the system biometric prompt. Resolves once the runtime responds.
 * Outside Capacitor / Despia, resolves with `not-despia` so callers can fall
 * back to a non-biometric path.
 */
export function requestBioAuth(): Promise<BioAuthResult> {
  if (isNative()) return requestBioAuthCapacitor();
  if (isDespia()) return requestBioAuthDespia();
  return Promise.resolve({ ok: false, reason: 'not-despia' });
}

/** Gate a sensitive action. In strict mode, missing biometrics = blocked. */
export async function confirmWithBiometrics(opts?: { strict?: boolean }): Promise<boolean> {
  const r = await requestBioAuth();
  if (r.ok) return true;
  const reason = (r as Extract<BioAuthResult, { ok: false }>).reason;
  if (reason === 'not-despia' || reason === 'unavailable' || reason === 'not-enrolled') {
    return !opts?.strict;
  }
  return false;
}

const BIO_PREF_KEY = 'vybe.bioauth.enabled';
export const getBioAuthPref = (): boolean => {
  try { return localStorage.getItem(BIO_PREF_KEY) === '1'; } catch { return false; }
};
export const setBioAuthPref = (on: boolean): void => {
  try { localStorage.setItem(BIO_PREF_KEY, on ? '1' : '0'); } catch { }
};
