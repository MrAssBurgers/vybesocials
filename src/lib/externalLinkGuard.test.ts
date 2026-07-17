import { describe, expect, it } from 'vitest';
import {
  isExternalHttpUrl,
  isExternalLinkGuardBypassed,
  isOAuthAuthUrl,
  runWithExternalLinkGuardBypassed,
} from './externalLinkGuard';

describe('externalLinkGuard OAuth allowlist', () => {
  it('detects Apple Sign-In authorize hosts', () => {
    expect(isOAuthAuthUrl('https://appleid.apple.com/auth/authorize?client_id=x')).toBe(true);
    expect(isOAuthAuthUrl('https://idmsa.apple.com/IDMSWebAuth/authenticate')).toBe(true);
    expect(isOAuthAuthUrl('https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js')).toBe(
      true,
    );
  });

  it('does not treat unrelated https as OAuth auth', () => {
    expect(isOAuthAuthUrl('https://accounts.google.com/o/oauth2/v2/auth')).toBe(false);
    expect(isOAuthAuthUrl('https://vybehub.app/native-callback.html')).toBe(false);
    expect(isOAuthAuthUrl('https://spotify.com')).toBe(false);
    expect(isOAuthAuthUrl('https://www.apple.com/')).toBe(false);
  });

  it('rejects non-http schemes', () => {
    expect(isExternalHttpUrl('oauth://auth')).toBe(false);
    expect(isOAuthAuthUrl('oauth://auth')).toBe(false);
    expect(isOAuthAuthUrl('')).toBe(false);
  });

  it('runWithExternalLinkGuardBypassed is a no-op when guard not installed', async () => {
    expect(isExternalLinkGuardBypassed()).toBe(false);
    const value = await runWithExternalLinkGuardBypassed(async () => {
      expect(isExternalLinkGuardBypassed()).toBe(false);
      return 42;
    });
    expect(value).toBe(42);
    expect(isExternalLinkGuardBypassed()).toBe(false);
  });
});
