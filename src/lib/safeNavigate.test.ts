import { describe, expect, it } from 'vitest';
import { isSafeInternalReturnPath, isValidDespiaOAuthDeeplink } from './safeNavigate';

describe('isSafeInternalReturnPath', () => {
  it('allows internal paths', () => {
    expect(isSafeInternalReturnPath('/home')).toBe(true);
    expect(isSafeInternalReturnPath('/auth/callback')).toBe(true);
  });

  it('rejects external and dangerous values', () => {
    expect(isSafeInternalReturnPath('https://evil.com')).toBe(false);
    expect(isSafeInternalReturnPath('//evil.com')).toBe(false);
    expect(isSafeInternalReturnPath('javascript:alert(1)')).toBe(false);
    expect(isSafeInternalReturnPath('')).toBe(false);
    expect(isSafeInternalReturnPath(null)).toBe(false);
  });
});

describe('isValidDespiaOAuthDeeplink', () => {
  it('accepts registered scheme oauth path', () => {
    expect(
      isValidDespiaOAuthDeeplink('com.despia.vybe://oauth/auth?custom_token=x'),
    ).toBe(true);
  });

  it('rejects malformed or unregistered schemes', () => {
    expect(isValidDespiaOAuthDeeplink('vybe:')).toBe(false);
    expect(isValidDespiaOAuthDeeplink('vybe://')).toBe(false);
    expect(isValidDespiaOAuthDeeplink('')).toBe(false);
    expect(isValidDespiaOAuthDeeplink(undefined)).toBe(false);
    expect(isValidDespiaOAuthDeeplink('https://vybehub.app/auth/callback')).toBe(false);
  });
});
