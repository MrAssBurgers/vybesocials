import { useSyncExternalStore } from 'react';
import { readDevicePreference, subscribeDevicePreference, writeDevicePreference } from './devicePreferences';

export const CONSENT_KEY = 'vybe_crash_consent';

export function getConsentState(): boolean | null {
  try {
    const val = readDevicePreference(CONSENT_KEY);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

export function setCrashReportConsent(consent: boolean): void {
  writeDevicePreference(CONSENT_KEY, String(consent));
}

const subscribeConsent = (listener: () => void) => subscribeDevicePreference(CONSENT_KEY, listener);
export function useCrashReportConsentState() {
  return useSyncExternalStore(subscribeConsent, getConsentState, () => null);
}
