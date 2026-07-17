import { describe, expect, it } from 'vitest';
import { getFriendlyAuthError } from './errorUtils';

describe('getFriendlyAuthError', () => {
  it('maps unauthorized domain', () => {
    expect(getFriendlyAuthError({ code: 'auth/unauthorized-domain' })).toBe(
      'This domain is not approved for sign-in.',
    );
  });

  it('maps popup blocked', () => {
    expect(getFriendlyAuthError({ code: 'auth/popup-blocked' })).toMatch(/blocked/i);
  });

  it('maps account exists', () => {
    expect(getFriendlyAuthError({ code: 'auth/account-exists-with-different-credential' })).toMatch(
      /already exists/i,
    );
  });

  it('suppresses cancelled popup', () => {
    expect(getFriendlyAuthError({ code: 'auth/popup-closed-by-user' })).toBe('__SUPPRESS__');
  });

  it('maps Apple SDK missing', () => {
    expect(getFriendlyAuthError({ name: 'apple/sdk-missing', message: 'Apple Sign-In unavailable' })).toMatch(
      /Apple Sign-In is unavailable/i,
    );
  });

  it('keeps actionable Apple invalid-credential copy', () => {
    expect(
      getFriendlyAuthError({
        name: 'auth/invalid-credential',
        message:
          'Apple rejected sign-in. Confirm Services ID com.despia.vybe.web and return URL https://vybehub.app/native-callback.html.',
      }),
    ).toMatch(/Services ID/i);
  });

  it('suppresses oauth handoff already-used race', () => {
    expect(
      getFriendlyAuthError({
        name: 'despia/oauth-redeem-failed',
        message: 'OAuth code expired or already used',
      }),
    ).toBe('__SUPPRESS__');
  });

  it('surfaces unknown auth codes', () => {
    expect(getFriendlyAuthError({ code: 'auth/weird-code' })).toBe(
      'Sign-in failed. Error code: auth/weird-code',
    );
  });

  it('never surfaces bare Apple unknown as the toast text', () => {
    expect(getFriendlyAuthError({ code: 'unknown', message: 'unknown' })).toMatch(/could not open/i);
    expect(getFriendlyAuthError({ name: 'unknown', message: 'unknown' })).toMatch(/could not open/i);
    expect(getFriendlyAuthError({ message: 'unknown' })).toMatch(/could not open/i);
    expect(getFriendlyAuthError('unknown')).toMatch(/could not open/i);
    expect(getFriendlyAuthError({ code: 'unknown', message: 'unknown' })).not.toMatch(/^unknown$/i);
  });
});
