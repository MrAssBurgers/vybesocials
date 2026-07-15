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

  it('surfaces unknown auth codes', () => {
    expect(getFriendlyAuthError({ code: 'auth/weird-code' })).toBe(
      'Sign-in failed. Error code: auth/weird-code',
    );
  });
});
