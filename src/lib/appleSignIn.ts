/**
 * Sign in with Apple via Apple JS SDK (native Face ID / Continue sheet on iOS Despia
 * and Safari). Android Despia should keep using oauth:// — see despiaOAuth.ts.
 */
import { OAuthProvider, signInWithCredential } from 'firebase/auth';
import { getProductionOrigin } from '@/lib/authRedirect';
import { mapOAuthLinkError } from '@/lib/oauthAccountLink';
import type { VybeAuthError, VybeSession } from '@/lib/firebase/types';

const APPLE_SCRIPT = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
const DEFAULT_APPLE_SERVICES_ID = 'com.despia.vybe.web';

type AppleAuthResponse = {
  authorization?: { id_token?: string; code?: string };
  user?: unknown;
  error?: string;
};

declare global {
  interface Window {
    AppleID?: {
      auth: {
        init: (cfg: Record<string, unknown>) => void;
        signIn: () => Promise<AppleAuthResponse>;
      };
    };
  }
}

function getAppleServicesId(): string {
  const fromEnv = import.meta.env.VITE_APPLE_SERVICES_ID || import.meta.env.VITE_APPLE_CLIENT_ID;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv.trim();
  return DEFAULT_APPLE_SERVICES_ID;
}

function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let scriptPromise: Promise<void> | null = null;

/** Prefetch Apple JS so the first tap opens the native sheet immediately. */
export function loadAppleIdScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.AppleID?.auth) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-apple-auth]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Apple auth script failed')));
      if (window.AppleID?.auth) resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = APPLE_SCRIPT;
    s.async = true;
    s.dataset.appleAuth = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Apple auth script failed to load'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Fire-and-forget preload for Landing mount. */
export function preloadAppleSignIn(): void {
  void loadAppleIdScript().catch(() => {
    /* ignore — tap will retry */
  });
}

/**
 * Native-style Apple Sign-In (JS SDK). Returns a Firebase session when successful.
 */
export async function signInWithAppleJsSdk(): Promise<{
  data: { session: VybeSession | null };
  error: VybeAuthError | null;
}> {
  try {
    await loadAppleIdScript();
    if (!window.AppleID?.auth) {
      return { data: { session: null }, error: { message: 'Apple Sign-In unavailable', name: 'apple/sdk-missing' } };
    }

    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);
    const redirectURI = `${getProductionOrigin()}/native-callback.html`;

    window.AppleID.auth.init({
      clientId: getAppleServicesId(),
      scope: 'name email',
      redirectURI,
      // Popup/native sheet on iOS WebView; avoids full-page Safari handoff.
      usePopup: true,
      nonce: hashedNonce,
    });

    const response = await window.AppleID.auth.signIn();
    const idToken = response.authorization?.id_token;
    if (!idToken) {
      return {
        data: { session: null },
        error: { message: 'Apple Sign-In did not return a token', name: 'apple/missing-token' },
      };
    }

    const { firebaseAuth } = await import('@/lib/firebase');
    const auth = firebaseAuth.auth;
    if (!auth) {
      return { data: { session: null }, error: { message: 'Firebase is not configured', name: 'firebase/not-configured' } };
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({ idToken, rawNonce });
    await signInWithCredential(auth, credential);
    const { data, error } = await firebaseAuth.getSession();
    if (error) return { data: { session: null }, error: mapOAuthLinkError(error) };
    return { data: { session: data.session }, error: null };
  } catch (err: unknown) {
    const asAny = err as { error?: string; message?: string; code?: string };
    if (
      asAny?.error === 'popup_closed_by_user' ||
      asAny?.error === 'user_cancelled' ||
      /cancel/i.test(String(asAny?.message || ''))
    ) {
      return {
        data: { session: null },
        error: { message: 'Sign-in cancelled', name: 'auth/popup-closed-by-user' },
      };
    }
    if (
      asAny?.code === 'auth/operation-not-allowed' ||
      /operation-not-allowed/i.test(String(asAny?.message || '')) ||
      /not enabled/i.test(String(asAny?.message || ''))
    ) {
      return {
        data: { session: null },
        error: {
          message: 'Apple Sign-In is not enabled for this app. Check Firebase Apple provider setup.',
          name: 'auth/operation-not-allowed',
        },
      };
    }
    if (/403|invalid_client|unauthorized/i.test(String(asAny?.message || ''))) {
      return {
        data: { session: null },
        error: {
          message:
            'Apple rejected sign-in. Confirm Services ID com.despia.vybe.web and return URL https://vybehub.app/native-callback.html.',
          name: 'auth/invalid-credential',
        },
      };
    }
    return { data: { session: null }, error: mapOAuthLinkError(err) };
  }
}
