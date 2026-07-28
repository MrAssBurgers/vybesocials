import { afterEach, describe, expect, it } from 'vitest';
import { isAppleAuthUser, markAppleAuthUser } from './appleNameCapture';

describe('Apple auth identity handoff', () => {
  afterEach(() => {
    localStorage.removeItem('vybe_apple_auth_uid_v1');
  });

  it('recognizes a normal Firebase Apple identity', () => {
    expect(
      isAppleAuthUser({ id: 'apple-1', identities: [{ provider: 'apple' }] }),
    ).toBe(true);
  });

  it('recognizes the matching custom-token Apple session only', () => {
    markAppleAuthUser('apple-custom-1');
    expect(isAppleAuthUser({ id: 'apple-custom-1', identities: [] })).toBe(true);
    expect(isAppleAuthUser({ id: 'different-user', identities: [] })).toBe(false);
  });
});
