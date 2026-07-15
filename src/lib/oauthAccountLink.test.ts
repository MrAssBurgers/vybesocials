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
});
