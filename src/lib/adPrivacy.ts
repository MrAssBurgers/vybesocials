export type AdTrackingConsent = 'allowed' | 'denied' | null;

export interface AdPrivacyDecision {
  consentResolved: boolean;
  isUnder13: boolean;
  isMinor: boolean;
  personalizedAds: boolean;
}

export function calculateAgeFromDateOfBirth(dob: string, today = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);
  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day ||
    birth > today
  ) return null;

  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

/**
 * Privacy-first ad decision shared by every ad surface.
 *
 * VYBE requires users to be 13+, but teens must never receive personalized
 * advertising. A missing birth date is treated as not eligible for
 * personalization until the account can be verified as an adult.
 */
export function resolveAdPrivacy(
  age: number | null | undefined,
  consent: AdTrackingConsent,
): AdPrivacyDecision {
  const hasKnownAge = typeof age === 'number' && Number.isFinite(age);
  const isUnder13 = hasKnownAge && age < 13;
  const isMinor = hasKnownAge && age < 18;

  return {
    consentResolved: consent !== null,
    isUnder13,
    isMinor,
    personalizedAds: consent === 'allowed' && hasKnownAge && age >= 18,
  };
}
