/**
 * Map native auth bridge failures → VybeAuthError.
 * Cancellation is silent (null) so Landing does not toast "Sign in failed".
 */
import type { VybeAuthError } from '@/lib/firebase/types';
import type { NativeAuthFailure, NativeAuthResult } from './types';

const CANCELLED_NAMES = new Set(['nativeauth/cancelled', 'auth/popup-closed-by-user']);

export function isNativeAuthCancelled(error: VybeAuthError | null | undefined): boolean {
  if (!error) return false;
  return CANCELLED_NAMES.has(error.name || '') || /cancel/i.test(error.message || '');
}

/**
 * Map a failure payload. Returns null for cancelled (silent).
 */
export function mapNativeAuthFailure(failure: NativeAuthFailure): VybeAuthError | null {
  if (failure.code === 'cancelled') {
    return null;
  }
  const message =
    (failure.message && failure.message.trim()) ||
    defaultMessage(failure.code);
  return {
    message,
    name: `nativeauth/${failure.code}`,
  };
}

export function mapNativeAuthResult(result: NativeAuthResult): VybeAuthError | null {
  if (result.ok) return null;
  return mapNativeAuthFailure(result);
}

function defaultMessage(code: NativeAuthFailure['code']): string {
  switch (code) {
    case 'network_error':
      return 'Network error during sign-in. Check your connection and try again.';
    case 'configuration_error':
      return 'Sign-in is misconfigured. Please try again later.';
    case 'missing_token':
      return 'Sign-in did not return a token. Please try again.';
    case 'provider_error':
      return 'Provider sign-in failed. Please try again.';
    case 'bridge_error':
      return 'Native sign-in is unavailable. Please try again.';
    case 'unknown':
    default:
      return 'Sign-in failed. Please try again.';
  }
}
