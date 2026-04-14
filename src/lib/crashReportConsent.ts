export const CONSENT_KEY = 'vybe_crash_consent';

export function getConsentState(): boolean | null {
  try {
    const val = localStorage.getItem(CONSENT_KEY);
    if (val === 'true') return true;
    if (val === 'false') return false;
    return null;
  } catch {
    return null;
  }
}