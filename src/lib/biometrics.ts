// Unified biometric wrapper.
// Resolves to the best available system: Capacitor (iOS/Android native shell)
// first, Despia second, then a no-op fallback for plain web.
//
// Public API mirrors the previous Despia-only module so existing imports
// keep working via the re-export in `./despiaBiometrics.ts`.

import { Capacitor } from '@capacitor/core';
import {
  BiometricAuth,
  BiometryErrorType,
} from '@aparajita/capacitor-biometric-auth';
import despia from 'despia-native';

declare global {
  interface Window {
    onBioAuthSuccess?: () => void;
    onBioAuthFailure?: (errorCode: string | number, errorMessage: string) => void;
    onBioAuthUnavailable?: () => void;
  }
}

export type BioAuthResult =
  | { ok: true }
  | { ok: false; reason: 'failed' | 'unavailable' | 'not-despia'; code?: string | number; message?: string };

const isCapacitor = (): boolean => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

export const isDespia = (): boolean =>
  typeof navigator !== 'undefined' &&
  navigator.userAgent.toLowerCase().includes('despia');

/** True when the current runtime can actually invoke a biometric prompt. */
export async function isBiometricsAvailable(): Promise<boolean> {
  if (isCapacitor()) {
    try {
      const info = await BiometricAuth.checkBiometry();
      return !!info.isAvailable;
    } catch { return false; }
  }
  return isDespia();
}

let despiaPending: ((r: BioAuthResult) => void) | null = null;
function settleDespia(r: BioAuthResult) {
  const fn = despiaPending; despiaPending = null; fn?.(r);
}

async function requestCapacitor(): Promise<BioAuthResult> {
  try {
    const info = await BiometricAuth.checkBiometry();
    if (!info.isAvailable) {
      return { ok: false, reason: 'unavailable', message: info.reason || 'no_biometry' };
    }
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
    if (
      code === BiometryErrorType.biometryNotAvailable ||
      code === BiometryErrorType.biometryNotEnrolled ||
      code === BiometryErrorType.noDeviceCredential
    ) {
      return { ok: false, reason: 'unavailable', code, message: e?.message };
    }
    return { ok: false, reason: 'failed', code, message: e?.message };
  }
}

function requestDespia(): Promise<BioAuthResult> {
  if (despiaPending) settleDespia({ ok: false, reason: 'failed', message: 'superseded' });
  return new Promise<BioAuthResult>((resolve) => {
    despiaPending = resolve;
    window.onBioAuthSuccess = () => settleDespia({ ok: true });
    window.onBioAuthFailure = (code, message) =>
      settleDespia({ ok: false, reason: 'failed', code, message });
    window.onBioAuthUnavailable = () =>
      settleDespia({ ok: false, reason: 'unavailable' });
    try { despia('bioauth://'); }
    catch (e) { settleDespia({ ok: false, reason: 'unavailable', message: (e as Error)?.message }); }
  });
}

/** Trigger the system biometric prompt. */
export function requestBioAuth(): Promise<BioAuthResult> {
  if (isCapacitor()) return requestCapacitor();
  if (isDespia()) return requestDespia();
  return Promise.resolve({ ok: false, reason: 'not-despia' });
}

/** Gate a sensitive action. In strict mode, missing biometrics = blocked. */
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
