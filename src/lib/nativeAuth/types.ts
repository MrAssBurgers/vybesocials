/**
 * Native iOS auth bridge types.
 *
 * This is the WebView contract for true AuthenticationServices / GIDSignIn
 * via Despia `nativeauth://`. It is NOT ASWebAuthenticationSession / oauth://.
 */

export type NativeAuthProvider = 'apple' | 'google';

export type NativeAuthErrorCode =
  | 'cancelled'
  | 'network_error'
  | 'configuration_error'
  | 'missing_token'
  | 'provider_error'
  | 'bridge_error'
  | 'unknown';

export type NativeAuthSuccess = {
  ok: true;
  provider: NativeAuthProvider;
  requestId: string;
  idToken: string;
  accessToken?: string;
  authorizationCode?: string;
  /** Only present if native generated the nonce; prefer WebView-owned rawNonce. */
  rawNonce?: string;
  email?: string;
  givenName?: string;
  familyName?: string;
};

export type NativeAuthFailure = {
  ok: false;
  provider?: NativeAuthProvider;
  requestId?: string;
  code: NativeAuthErrorCode;
  message?: string;
};

export type NativeAuthResult = NativeAuthSuccess | NativeAuthFailure;

export type NativeAuthRequestOptions = {
  /** SHA-256 hex of WebView-owned raw nonce (Apple). */
  nonceHash?: string;
  timeoutMs?: number;
};

export const NATIVE_AUTH_ERROR_CODES: readonly NativeAuthErrorCode[] = [
  'cancelled',
  'network_error',
  'configuration_error',
  'missing_token',
  'provider_error',
  'bridge_error',
  'unknown',
] as const;
