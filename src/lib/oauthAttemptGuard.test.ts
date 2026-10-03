import { describe, expect, it } from 'vitest';
import {
  beginOAuthAttempt,
  clearOAuthAttempt,
  isOAuthUserCancellation,
  settleOAuthAttemptWithSession,
  shouldSuppressOAuthError,
} from './oauthAttemptGuard';

describe('oauthAttemptGuard', () => {
  it('settles once and suppresses stale internal errors', () => {
    const attemptId = beginOAuthAttempt('apple');
    expect(settleOAuthAttemptWithSession(attemptId)).toBe(true);
    expect(
      shouldSuppressOAuthError({ name: 'auth/internal-error', message: 'internal' }, attemptId),
    ).toBe(true);
    clearOAuthAttempt(attemptId);
  });

  it('does not suppress real errors before settlement', () => {
    beginOAuthAttempt('apple');
    expect(
      shouldSuppressOAuthError({ name: 'auth/network-request-failed', message: 'offline' }),
    ).toBe(false);
    clearOAuthAttempt();
  });

  it('detects user cancellation quietly', () => {
    expect(isOAuthUserCancellation({ name: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isOAuthUserCancellation({ message: 'User cancelled sign-in' })).toBe(true);
  });
});
