import { describe, expect, it } from 'vitest';
import { buildQrSignInClaimUrl, parseQrSignInNonce } from '@/lib/qrSignIn';

describe('qrSignIn', () => {
  it('builds a https claim URL with nonce', () => {
    const url = buildQrSignInClaimUrl('abcDEF1234567890_x');
    expect(url).toContain('https://vybehub.app/qr-claim.html');
    expect(url).toContain('nonce=abcDEF1234567890_x');
  });

  it('parses camera claim links and legacy payloads', () => {
    expect(parseQrSignInNonce('https://vybehub.app/qr-claim.html?nonce=tokentokentoken12')).toBe(
      'tokentokentoken12',
    );
    expect(parseQrSignInNonce('https://vybehub.app/auth/qr/claim?nonce=tokentokentoken12')).toBe(
      'tokentokentoken12',
    );
    expect(parseQrSignInNonce('vybe-qr:tokentokentoken12')).toBe('tokentokentoken12');
    expect(parseQrSignInNonce('tokentokentoken12')).toBe('tokentokentoken12');
  });
});
