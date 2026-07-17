import { describe, expect, it } from 'vitest';
import {
  getAccountExistsOAuthMessage,
  isAccountExistsWithDifferentCredential,
  mapOAuthLinkError,
} from './oauthAccountLink';

describe('oauthAccountLink', () => {
  it('detects account-exists codes', () => {
    expect(
      isAccountExistsWithDifferentCredential({
        code: 'auth/account-exists-with-different-credential',
      }),
    ).toBe(true);
    expect(
      isAccountExistsWithDifferentCredential({ name: 'auth/credential-already-in-use' }),
    ).toBe(true);
    expect(isAccountExistsWithDifferentCredential({ code: 'auth/network-request-failed' })).toBe(
      false,
    );
  });

  it('maps account-exists to settings guidance', () => {
    const mapped = mapOAuthLinkError({
      code: 'auth/account-exists-with-different-credential',
      message: 'raw',
    });
    expect(mapped.name).toBe('auth/account-exists-with-different-credential');
    expect(mapped.message).toBe(getAccountExistsOAuthMessage());
    expect(mapped.message).toMatch(/Settings/);
  });

  it('preserves Firebase message and code', () => {
    const mapped = mapOAuthLinkError({
      code: 'auth/invalid-credential',
      message: 'The supplied auth credential is malformed or has expired.',
    });
    expect(mapped.name).toBe('auth/invalid-credential');
    expect(mapped.message).toBe('The supplied auth credential is malformed or has expired.');
  });

  it('includes code when message is empty', () => {
    const mapped = mapOAuthLinkError({
      code: 'auth/internal-error',
      message: '',
    });
    expect(mapped.name).toBe('auth/internal-error');
    expect(mapped.message).toBe('Sign-in failed (auth/internal-error)');
    expect(mapped.message).not.toBe('Sign-in failed');
  });

  it('uses name as code when code is missing', () => {
    const mapped = mapOAuthLinkError({
      name: 'auth/network-request-failed',
      message: '   ',
    });
    expect(mapped.name).toBe('auth/network-request-failed');
    expect(mapped.message).toBe('Sign-in failed (auth/network-request-failed)');
  });

  it('falls back to Sign-in failed only when no code or message', () => {
    expect(mapOAuthLinkError(null).message).toBe('Sign-in failed');
    expect(mapOAuthLinkError({}).message).toBe('Sign-in failed');
  });
});
