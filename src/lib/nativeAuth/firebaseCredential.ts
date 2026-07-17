/**
 * Build Firebase credentials from native auth bridge success and sign in.
 * Prefer signInWithCredential — never native-callback / oauthDismiss / exchange_*.
 */
import { GoogleAuthProvider, OAuthProvider, signInWithCredential } from 'firebase/auth';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';
import type { NativeAuthSuccess } from './types';
import { assertLegacyPathNotUsed, nativeAuthTelemetry } from './telemetry';

export type NativeCredentialSignInResult = {
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
};

export async function signInWithNativeCredential(
  success: NativeAuthSuccess,
  opts?: { rawNonce?: string },
): Promise<NativeCredentialSignInResult> {
  nativeAuthTelemetry('native_auth_credential_start', {
    provider: success.provider,
    hasAccessToken: Boolean(success.accessToken),
  });

  try {
    const { firebaseAuth } = await import('@/lib/firebase');
    const auth = firebaseAuth.auth;
    if (!auth) {
      return {
        data: { session: null },
        error: { message: 'Firebase is not configured', name: 'firebase/not-configured' },
      };
    }

    if (success.provider === 'apple') {
      const rawNonce = opts?.rawNonce || success.rawNonce;
      if (!rawNonce) {
        return {
          data: { session: null },
          error: {
            message: 'Apple Sign-In missing nonce',
            name: 'nativeauth/missing_token',
          },
        };
      }
      const apple = new OAuthProvider('apple.com');
      const credential = apple.credential({
        idToken: success.idToken,
        rawNonce,
      });
      await signInWithCredential(auth, credential);
    } else {
      const credential = GoogleAuthProvider.credential(
        success.idToken,
        success.accessToken || undefined,
      );
      await signInWithCredential(auth, credential);
    }

    await auth.authStateReady();
    const { data, error } = await firebaseAuth.getSession();
    if (error) {
      nativeAuthTelemetry('native_auth_credential_done', {
        provider: success.provider,
        ok: false,
      });
      return { data: { session: null }, error: mapOAuthLinkError(error) };
    }

    assertLegacyPathNotUsed({
      provider: success.provider,
      usedNativeCallback: false,
      usedOauthDismiss: false,
      usedExchange: false,
    });

    nativeAuthTelemetry('native_auth_credential_done', {
      provider: success.provider,
      ok: true,
      hasUser: Boolean(data.session?.user),
    });

    return { data: { session: data.session }, error: null };
  } catch (err: unknown) {
    nativeAuthTelemetry('native_auth_credential_done', {
      provider: success.provider,
      ok: false,
    });
    return { data: { session: null }, error: mapOAuthLinkError(err) };
  }
}
