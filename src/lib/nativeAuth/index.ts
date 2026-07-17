/**
 * Native iOS auth scaffold — Despia AuthenticationServices / GIDSignIn bridge.
 *
 * Activates only when feature flag `native_ios_auth_v1` is ON **and** the
 * Despia bridge advertises native auth. Until Despia ships the SDKs, this
 * module stays dormant and existing oauth:// / Apple JS paths remain.
 *
 * Do NOT confuse with ASWebAuthenticationSession (oauth://) — that is legacy.
 *
 * @see docs/DESPIA_NATIVE_AUTH_SUPPORT_REQUEST.md
 * @see docs/NATIVE_IOS_AUTH_AUDIT.md
 */
import { isFeatureEnabled } from '@/lib/featureFlags';
import { isBridgeAvailable } from './bridge';
import { isNativeAuthPlatformEligible } from './platform';
import type { NativeAuthProvider } from './types';
import { nativeAuthTelemetry } from './telemetry';

export type { NativeAuthProvider, NativeAuthResult, NativeAuthErrorCode } from './types';
export { isBridgeAvailable, requestNativeAuth, __resetNativeAuthBridgeForTests } from './bridge';
export { isNativeAuthPlatformEligible, isNativeAuthProvider } from './platform';
export { signInWithAppleNative as signInWithApple } from './apple';
export { signInWithGoogleNative as signInWithGoogle } from './google';
export { mapNativeAuthFailure, mapNativeAuthResult, isNativeAuthCancelled } from './errors';
export {
  nativeAuthTelemetry,
  redactNativeAuthTelemetry,
  assertLegacyPathNotUsed,
  NATIVE_AUTH_TELEMETRY_STAGES,
} from './telemetry';
export { signInWithNativeCredential } from './firebaseCredential';

/** Feature flag on (defaults false in production). */
export function isNativeAuthEnabled(): boolean {
  return isFeatureEnabled('native_ios_auth_v1');
}

/**
 * True when we should use the nativeauth:// bridge for this provider:
 * flag ON + iOS Despia + bridge advertised.
 * Android always false (App Link / oauth:// unchanged).
 */
export function shouldUseNativeAuth(provider: NativeAuthProvider): boolean {
  const flagOn = isNativeAuthEnabled();
  const platformOk = isNativeAuthPlatformEligible();
  const bridgeOk = isBridgeAvailable();
  nativeAuthTelemetry('native_auth_eligible_check', {
    provider,
    flagOn,
    platformOk,
    bridgeOk,
  });
  if (!flagOn || !platformOk || !bridgeOk) return false;
  if (provider !== 'apple' && provider !== 'google') return false;
  return true;
}
