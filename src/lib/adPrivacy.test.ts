import { describe, expect, it } from 'vitest';
import { calculateAgeFromDateOfBirth, resolveAdPrivacy } from './adPrivacy';

describe('resolveAdPrivacy', () => {
  it('allows personalization only for a consenting adult', () => {
    expect(resolveAdPrivacy(18, 'allowed').personalizedAds).toBe(true);
    expect(resolveAdPrivacy(35, 'allowed').personalizedAds).toBe(true);
  });

  it('never personalizes ads for teenagers', () => {
    expect(resolveAdPrivacy(13, 'allowed').personalizedAds).toBe(false);
    expect(resolveAdPrivacy(17, 'allowed').personalizedAds).toBe(false);
  });

  it('never personalizes without an explicit choice and a verified age', () => {
    expect(resolveAdPrivacy(24, null).personalizedAds).toBe(false);
    expect(resolveAdPrivacy(null, 'allowed').personalizedAds).toBe(false);
  });

  it('recognizes child and minor age bands', () => {
    expect(resolveAdPrivacy(12, 'denied')).toMatchObject({ isUnder13: true, isMinor: true });
    expect(resolveAdPrivacy(16, 'denied')).toMatchObject({ isUnder13: false, isMinor: true });
    expect(resolveAdPrivacy(18, 'denied')).toMatchObject({ isUnder13: false, isMinor: false });
  });

  it('calculates age at the birthday boundary and rejects invalid dates', () => {
    const today = new Date(2026, 6, 28);
    expect(calculateAgeFromDateOfBirth('2008-07-28', today)).toBe(18);
    expect(calculateAgeFromDateOfBirth('2008-07-29', today)).toBe(17);
    expect(calculateAgeFromDateOfBirth('not-a-date', today)).toBeNull();
    expect(calculateAgeFromDateOfBirth('2027-01-01', today)).toBeNull();
  });
});
