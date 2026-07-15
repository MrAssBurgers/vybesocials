import { describe, expect, it } from 'vitest';
import { DEFAULT_FIREBASE_AUTH_DOMAIN, getFirebaseAuthDomain } from './authDomain';

describe('getFirebaseAuthDomain', () => {
  it('defaults to firebaseapp.com', () => {
    expect(getFirebaseAuthDomain('')).toBe(DEFAULT_FIREBASE_AUTH_DOMAIN);
    expect(getFirebaseAuthDomain(null)).toBe(DEFAULT_FIREBASE_AUTH_DOMAIN);
  });

  it('keeps firebaseapp.com and web.app', () => {
    expect(getFirebaseAuthDomain('vybe-daaab.firebaseapp.com')).toBe('vybe-daaab.firebaseapp.com');
    expect(getFirebaseAuthDomain('https://vybe-daaab.web.app')).toBe('vybe-daaab.web.app');
  });

  it('rejects custom marketing domains that SPA-swallow /__/auth', () => {
    expect(getFirebaseAuthDomain('vybehub.app')).toBe(DEFAULT_FIREBASE_AUTH_DOMAIN);
    expect(getFirebaseAuthDomain('https://www.vybehub.app/')).toBe(DEFAULT_FIREBASE_AUTH_DOMAIN);
  });
});
