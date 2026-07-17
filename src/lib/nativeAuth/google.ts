/**
 * Native Google Sign-In via Despia nativeauth:// + Firebase credential.
 */
import { requestNativeAuth } from './bridge';
import { mapNativeAuthFailure } from './errors';
import { signInWithNativeCredential } from './firebaseCredential';
import { nativeAuthTelemetry } from './telemetry';
import type { NativeAuthResult } from './types';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

export type NativeGoogleSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
};

/**
 * Request native Google auth and complete with signInWithCredential.
 * Never uses native-callback / oauthDismiss / exchange_*.
 */
export async function signInWithGoogleNative(
  opts?: { timeoutMs?: number },
): Promise<NativeGoogleSignInResult> {
  nativeAuthTelemetry('native_auth_start', { provider: 'google' });

  const bridgeResult: NativeAuthResult = await requestNativeAuth('google', {
    timeoutMs: opts?.timeoutMs,
  });

  if (bridgeResult.ok === false) {
    if (bridgeResult.code === 'cancelled') {
      nativeAuthTelemetry('native_auth_cancelled', { provider: 'google' });
    } else {
      nativeAuthTelemetry('native_auth_error', {
        provider: 'google',
        code: bridgeResult.code,
      });
    }
    return { data: { session: null }, error: mapNativeAuthFailure(bridgeResult) };
  }

  nativeAuthTelemetry('native_auth_bridge_reply', {
    provider: 'google',
    ok: true,
    hasIdToken: true,
    idTokenLen: bridgeResult.idToken.length,
  });

  return signInWithNativeCredential(bridgeResult);
}
