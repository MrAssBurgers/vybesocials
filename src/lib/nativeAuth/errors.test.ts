import { describe, expect, it } from 'vitest';
import { mapNativeAuthFailure, isNativeAuthCancelled } from './errors';
import {
  assertLegacyPathNotUsed,
  redactNativeAuthTelemetry,
  NATIVE_AUTH_TELEMETRY_STAGES,
} from './telemetry';

describe('nativeAuth errors', () => {
  it('maps cancelled to silent null', () => {
    expect(
      mapNativeAuthFailure({
        ok: false,
        code: 'cancelled',
        provider: 'apple',
      }),
    ).toBeNull();
  });

  it('maps other codes to VybeAuthError', () => {
    const err = mapNativeAuthFailure({
      ok: false,
      code: 'network_error',
      provider: 'google',
      message: 'offline',
    });
    expect(err).not.toBeNull();
    expect(err?.name).toBe('nativeauth/network_error');
    expect(err?.message).toBe('offline');
  });

  it('isNativeAuthCancelled recognizes cancel names', () => {
    expect(isNativeAuthCancelled({ name: 'nativeauth/cancelled', message: 'x' })).toBe(true);
    expect(isNativeAuthCancelled({ name: 'auth/popup-closed-by-user', message: 'x' })).toBe(true);
    expect(isNativeAuthCancelled({ name: 'nativeauth/network_error', message: 'x' })).toBe(false);
    expect(isNativeAuthCancelled(null)).toBe(false);
  });
});

describe('nativeAuth telemetry', () => {
  it('redacts tokens email nonce', () => {
    const clean = redactNativeAuthTelemetry({
      provider: 'apple',
      idToken: 'SECRET_TOKEN_VALUE',
      email: 'user@example.com',
      rawNonce: 'nonce-secret',
      accessToken: 'atk',
      ok: true,
      idTokenLen: 42,
    });
    expect(clean.provider).toBe('apple');
    expect(clean.ok).toBe(true);
    expect(clean.idTokenLen).toBe(42);
    expect(clean.idToken).toBeUndefined();
    expect(clean.email).toBeUndefined();
    expect(clean.rawNonce).toBeUndefined();
    expect(clean.accessToken).toBeUndefined();
  });

  it('has allowlisted stages', () => {
    expect(NATIVE_AUTH_TELEMETRY_STAGES).toContain('native_auth_start');
    expect(NATIVE_AUTH_TELEMETRY_STAGES).toContain('native_auth_legacy_assert');
  });

  it('assertLegacyPathNotUsed does not throw when legacy counters are zero', () => {
    assertLegacyPathNotUsed({
      provider: 'apple',
      usedNativeCallback: false,
      usedOauthDismiss: false,
      usedExchange: false,
    });
  });
});
