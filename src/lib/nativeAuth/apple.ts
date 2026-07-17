/**
 * Native Apple Sign-In via Despia nativeauth:// + Firebase credential.
 * WebView owns the raw nonce; only nonceHash is sent to native.
 */
import { requestNativeAuth } from './bridge';
import { mapNativeAuthFailure } from './errors';
import { signInWithNativeCredential } from './firebaseCredential';
import { nativeAuthTelemetry } from './telemetry';
import type { NativeAuthResult } from './types';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export type NativeAppleSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
};

/**
 * Request native Apple auth and complete with signInWithCredential.
 * Never uses native-callback / oauthDismiss / exchange_*.
 */
export async function signInWithAppleNative(
  opts?: { timeoutMs?: number },
): Promise<NativeAppleSignInResult> {
  const rawNonce = randomNonce();
  const nonceHash = await sha256Hex(rawNonce);

  nativeAuthTelemetry('native_auth_start', { provider: 'apple' });

  const bridgeResult: NativeAuthResult = await requestNativeAuth('apple', {
    nonceHash,
    timeoutMs: opts?.timeoutMs,
  });

  if (bridgeResult.ok === false) {
    if (bridgeResult.code === 'cancelled') {
      nativeAuthTelemetry('native_auth_cancelled', { provider: 'apple' });
    } else {
      nativeAuthTelemetry('native_auth_error', {
        provider: 'apple',
        code: bridgeResult.code,
      });
    }
    return { data: { session: null }, error: mapNativeAuthFailure(bridgeResult) };
  }

  nativeAuthTelemetry('native_auth_bridge_reply', {
    provider: 'apple',
    ok: true,
    hasIdToken: true,
    idTokenLen: bridgeResult.idToken.length,
  });

  return signInWithNativeCredential(bridgeResult, { rawNonce });
}
