import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  browserPopupRedirectResolver,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  updatePassword as firebaseUpdatePassword,
  linkWithPopup,
  unlink as firebaseUnlink,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  signInWithCustomToken,
  type Auth,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { connectLocalPreviewAuth } from './emulators';
import { isLocalPreview } from './localPreview';
import { getFirebaseConfig, isFirebaseConfigured } from './config';
import {
  clearMirroredAuth,
  ensureAuthStorageReady,
  isAuthStorageReady,
  mirrorAuthUserJson,
  prefersLocalAuthPersistence,
  seedFirebaseAuthFromBackup,
  writeAuthVault,
} from '@/lib/authSessionMirror';
import type { VybeSession, VybeUser, VybeAuthError } from './types';

let authInstance: Auth | null = null;

const NOT_CONFIGURED: VybeAuthError = {
  message: 'Firebase is not configured. Set VITE_FIREBASE_* variables (see .env.example).',
  name: 'firebase/not-configured',
};

/** Single sign-in timeout — used by password login (auth.tsx should not stack another). */
export const SIGN_IN_TIMEOUT_MS = 12000;

/**
 * Shared Auth instance.
 *
 * NEVER use bare getAuth() for first init on mobile/Despia — that installs
 * browserPopupRedirectResolver and eagerly opens
 * https://*.firebaseapp.com/__/auth/iframe (parent=localhost:7777), which
 * Despia Offline→Native hands off to Safari on every cold start.
 *
 * Persist only; pass browserPopupRedirectResolver at popup/redirect call sites.
 */
function currentApiKey(): string {
  try {
    return isFirebaseConfigured() ? getFirebaseConfig().apiKey : '';
  } catch {
    return '';
  }
}

async function settleAuthStorage(): Promise<void> {
  if (isLocalPreview()) return;
  const apiKey = currentApiKey();
  if (!apiKey) return;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  await ensureAuthStorageReady(apiKey, ua);
}

function resolveAuth(): Auth | null {
  if (!isFirebaseConfigured()) return null;
  const localPreview = isLocalPreview();
  if (!localPreview && !isAuthStorageReady()) return null;
  if (authInstance) { connectLocalPreviewAuth(authInstance); return authInstance; }
  const app = getFirebaseApp();
  const apiKey = currentApiKey();
  if (!localPreview && typeof localStorage !== 'undefined' && apiKey) {
    seedFirebaseAuthFromBackup(localStorage, apiKey);
  }
  try {
    // Phones, including Fold WebViews with no "; wv": IndexedDB is often wiped
    // when the process dies and can hang open. Keep the session in localStorage.
    const mobile =
      typeof navigator !== 'undefined' &&
      prefersLocalAuthPersistence(navigator.userAgent || '');
    authInstance = initializeAuth(app, {
      // Demo sessions remain in this tab and never enter the normal recovery mirror.
      persistence: localPreview ? [browserSessionPersistence] : mobile
        ? [browserLocalPersistence, browserSessionPersistence]
        : [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
    });
  } catch {
    // HMR / duplicate init — reuse existing Auth on the app
    authInstance = getAuth(app);
  }
  connectLocalPreviewAuth(authInstance);
  return authInstance;
}

function rememberAuthUser(user: FirebaseUser | null) {
  if (isLocalPreview()) return;
  if (!user || typeof localStorage === 'undefined') return;
  const apiKey = currentApiKey();
  if (!apiKey) return;
  try {
    const json = JSON.stringify(user.toJSON());
    mirrorAuthUserJson(localStorage, apiKey, json);
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (prefersLocalAuthPersistence(ua)) writeAuthVault(json);
  } catch {
    /* private mode */
  }
}

/** Prefer this over getAuth() so Auth never re-inits with the eager iframe resolver. */
export function getFirebaseAuth(): Auth | null {
  return resolveAuth();
}

export { browserPopupRedirectResolver };

function mapProviderId(providerId: string): string {
  if (providerId === 'google.com') return 'google';
  if (providerId === 'apple.com') return 'apple';
  if (providerId === 'password') return 'email';
  return providerId.replace('.com', '');
}

function toVybeUser(user: FirebaseUser): VybeUser {
  const identities = user.providerData.map((p) => ({
    provider: mapProviderId(p.providerId),
    identity_id: `${user.uid}-${p.providerId}`,
    identity_data: {
      email: p.email,
      sub: p.uid,
      provider_id: p.providerId,
    },
  }));

  return {
    id: user.uid,
    email: user.email,
    phone: user.phoneNumber,
    app_metadata: {},
    user_metadata: user.displayName ? { display_name: user.displayName, username: user.displayName } : {},
    created_at: user.metadata.creationTime || new Date().toISOString(),
    email_confirmed_at: user.emailVerified ? new Date().toISOString() : null,
    identities,
  };
}

function toAuthError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; code?: string };
    return { message: e.message || 'Auth error', name: e.code };
  }
  return { message: 'Auth error' };
}

function isRetryableAuthNetworkError(error: VybeAuthError): boolean {
  const code = (error.name || '').toLowerCase();
  const msg = (error.message || '').toLowerCase();
  return (
    code === 'auth/network-request-failed' ||
    code === 'auth/timeout' ||
    msg.includes('network') ||
    msg.includes('failed to fetch') ||
    msg.includes('fetch') ||
    msg.includes('timed out')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Sync session — never blocks on network (login/navigation must use this first). */
function buildVybeSessionInstant(user: FirebaseUser): VybeSession {
  return {
    user: toVybeUser(user),
    access_token: '',
    refresh_token: user.refreshToken,
  };
}

async function withAuthTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(Object.assign(new Error(message), { code: 'auth/timeout' }));
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Best-effort token enrich — capped; returns instant session on any failure. */
async function enrichSessionToken(
  session: VybeSession,
  user: FirebaseUser,
  timeoutMs = 3000,
): Promise<VybeSession> {
  if (session.access_token) return session;
  try {
    const token = await withAuthTimeout(
      user.getIdToken(false),
      timeoutMs,
      'Token fetch timed out',
    );
    return { ...session, access_token: token };
  } catch {
    return session;
  }
}

async function buildVybeSessionFallback(user: FirebaseUser): Promise<VybeSession> {
  return enrichSessionToken(buildVybeSessionInstant(user), user, 2000);
}

function sessionFromCurrentUser(auth: Auth): VybeSession | null {
  const user = auth?.currentUser;
  if (!user) return null;
  return buildVybeSessionInstant(user);
}

/** Full session with expiry — refresh flows only; always time-capped. */
async function toVybeSession(user: FirebaseUser): Promise<VybeSession> {
  const instant = buildVybeSessionInstant(user);
  try {
    const result = await withAuthTimeout(user.getIdTokenResult(), 5000, 'Token fetch timed out');
    return {
      ...instant,
      access_token: result.token,
      expires_at: result.expirationTime
        ? Math.floor(new Date(result.expirationTime).getTime() / 1000)
        : undefined,
    };
  } catch {
    return enrichSessionToken(instant, user, 2000);
  }
}

type AuthStateCallback = (event: string, session: VybeSession | null) => void;

export const firebaseAuth = {
  get auth() {
    return resolveAuth();
  },

  async getSession(): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    await settleAuthStorage();
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user) return { data: { session: null }, error: null };
    const instant = buildVybeSessionInstant(user);
    void enrichSessionToken(instant, user, 3000);
    return { data: { session: instant }, error: null };
  },

  async getUser(): Promise<{ data: { user: VybeUser | null }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: { user: null }, error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user) return { data: { user: null }, error: null };
    return { data: { user: toVybeUser(user) }, error: null };
  },

  async refreshSession(_opts?: { refresh_token?: string }): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user) return { data: { session: null }, error: { message: 'Not authenticated' } };
    try {
      await withAuthTimeout(user.getIdToken(true), 8000, 'Session refresh timed out');
      return { data: { session: await toVybeSession(user) }, error: null };
    } catch (err) {
      const instant = buildVybeSessionInstant(user);
      return { data: { session: instant }, error: toAuthError(err) };
    }
  },

  async exchangeCodeForSession(_code: string): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    return { data: { session: null }, error: { message: 'exchangeCodeForSession not supported on Firebase Auth — use email link or oauth flow' } };
  },

  onAuthStateChange(callback: AuthStateCallback) {
    let unsubscribe = () => {};
    let cancelled = false;
    const attach = () => {
      if (cancelled) return;
      const auth = resolveAuth();
      if (!auth) {
        callback('INITIAL_SESSION', null);
        return;
      }
      let initialFired = false;
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      rememberAuthUser(firebaseUser);
      const emit = (event: string, session: VybeSession | null) => {
        try {
          callback(event, session);
        } catch (err) {
          console.warn('[auth] onAuthStateChange callback error:', err);
        }
      };

      if (!firebaseUser) {
        if (!initialFired) {
          initialFired = true;
          emit('INITIAL_SESSION', null);
        } else {
          emit('SIGNED_OUT', null);
        }
        return;
      }

      const instant = buildVybeSessionInstant(firebaseUser);
      if (!initialFired) {
        initialFired = true;
        emit('INITIAL_SESSION', instant);
      } else {
        emit('SIGNED_IN', instant);
      }

      void enrichSessionToken(instant, firebaseUser, 5000).then((enriched) => {
        if (!enriched.access_token) return;
        emit('TOKEN_REFRESHED', enriched);
      });
      });
    };
    void settleAuthStorage().then(attach);
    return {
      data: {
        subscription: {
          unsubscribe: () => {
            cancelled = true;
            unsubscribe();
          },
        },
      },
    };
  },

  async signUp(payload: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }) {
    await settleAuthStorage();
    const auth = resolveAuth();
    if (!auth) return { data: { user: null, session: null }, error: NOT_CONFIGURED };
    let cred: Awaited<ReturnType<typeof createUserWithEmailAndPassword>>;
    try {
      cred = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
    } catch (err) {
      return { data: { user: null, session: null }, error: toAuthError(err) };
    }

    // Account creation is authoritative. Everything after this point reports its
    // own status and must never turn a created, signed-in account into "failed".
    const username = payload.options?.data?.username as string | undefined;
    if (username) {
      await firebaseUpdateProfile(cred.user, { displayName: username }).catch((error) => {
        console.warn('[auth] signup display name sync deferred:', error);
      });
    }

    // AuthProvider provisions the profile through the checked server authority.
    let verificationEmailSent = true;
    try {
      await sendEmailVerification(cred.user);
    } catch (error) {
      verificationEmailSent = false;
      console.warn('[auth] verification email delivery failed after account creation:', error);
    }

    const session = buildVybeSessionInstant(cred.user);
    void enrichSessionToken(session, cred.user, 5000);
    return {
      data: {
        user: session.user,
        session,
        verificationEmailSent,
        profileBootstrapSucceeded: false,
      },
      error: null,
    };
  },

  async signInWithPassword(payload: { email: string; password: string }) {
    await settleAuthStorage();
    const auth = resolveAuth();
    if (!auth) return { data: { user: null, session: null }, error: NOT_CONFIGURED };

    let lastErr: VybeAuthError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cred = await withAuthTimeout(
          signInWithEmailAndPassword(auth, payload.email, payload.password),
          SIGN_IN_TIMEOUT_MS,
          'Sign-in timed out. Check your connection and try again.',
        );
        const session = buildVybeSessionInstant(cred.user);
        void enrichSessionToken(session, cred.user, 5000);
        return {
          data: { user: session.user, session },
          error: null,
        };
      } catch (err) {
        lastErr = toAuthError(err);
        const recovered = sessionFromCurrentUser(auth);
        if (recovered?.user) {
          return { data: { user: recovered.user, session: recovered }, error: null };
        }
        const code = lastErr.name || '';
        if (
          code === 'auth/invalid-credential' ||
          code === 'auth/wrong-password' ||
          code === 'auth/user-not-found' ||
          code === 'auth/invalid-email' ||
          code === 'auth/user-disabled'
        ) {
          break;
        }
        if (attempt < 1 && isRetryableAuthNetworkError(lastErr)) {
          await sleep(400);
          continue;
        }
        break;
      }
    }

    const recovered = sessionFromCurrentUser(auth);
    if (recovered?.user) {
      return { data: { user: recovered.user, session: recovered }, error: null };
    }
    return { data: { user: null, session: null }, error: lastErr };
  },

  async resend(payload: { type: string; email: string; options?: { emailRedirectTo?: string } }) {
    const auth = resolveAuth();
    if (!auth) return { error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user || user.email !== payload.email) {
      return { error: { message: 'Sign in required to resend verification email' } };
    }
    try {
      await sendEmailVerification(user);
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    }
  },

  async signOut(_options?: { scope?: 'local' | 'global' }) {
    const auth = resolveAuth();
    if (!auth) return { error: NOT_CONFIGURED };
    try {
      // Always clear local Firebase persistence. A prior "local = no-op" stub left
      // firebase:authUser:* in localStorage so logout → refresh restored the session.
      await firebaseSignOut(auth);
      if (!isLocalPreview() && typeof localStorage !== 'undefined') {
        try {
          clearMirroredAuth(localStorage);
        } catch {
          /* ignore */
        }
      }
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    }
  },

  async setSession(_tokens: { access_token: string; refresh_token?: string }) {
    return this.getSession();
  },

  /** QR / passkey redeem — exchange Admin custom token for a client session. */
  async signInWithCustomToken(
    customToken: string,
  ): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };
    try {
      const cred = await withAuthTimeout(
        signInWithCustomToken(auth, customToken),
        SIGN_IN_TIMEOUT_MS,
        'Sign-in timed out',
      );
      const session = buildVybeSessionInstant(cred.user);
      void enrichSessionToken(session, cred.user, 5000);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
  },

  async resetPasswordForEmail(email: string, redirect?: string | { redirectTo?: string }) {
    const auth = resolveAuth();
    if (!auth) return { error: NOT_CONFIGURED };
    try {
      const url = typeof redirect === 'string' ? redirect : redirect?.redirectTo;
      await sendPasswordResetEmail(
        auth,
        email,
        url ? { url, handleCodeInApp: true } : undefined,
      );
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    }
  },
  async signInWithOAuth(
    provider: 'google' | 'apple',
    opts?: { extraParams?: Record<string, string>; useRedirect?: boolean }
  ): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null; redirected?: boolean }> {
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };
    try {
      let authProvider;
      if (provider === 'google') {
        const gp = new GoogleAuthProvider();
        gp.addScope('email');
        gp.addScope('profile');
        if (opts?.extraParams) gp.setCustomParameters(opts.extraParams);
        authProvider = gp;
      } else {
        const ap = new OAuthProvider('apple.com');
        ap.addScope('email');
        ap.addScope('name');
        if (opts?.extraParams) ap.setCustomParameters(opts.extraParams);
        authProvider = ap;
      }

      if (opts?.useRedirect) {
        const { markOAuthRedirectPending } = await import('./oauthRedirect');
        markOAuthRedirectPending({ provider, returnPath: '/auth/callback' });
        await signInWithRedirect(auth, authProvider, browserPopupRedirectResolver);
        return { data: { session: null }, error: null, redirected: true };
      }

      const result = await signInWithPopup(auth, authProvider, browserPopupRedirectResolver);
      const session = buildVybeSessionInstant(result.user);
      void enrichSessionToken(session, result.user, 5000);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
  },

  /** Native Google/Apple via Capacitor Firebase Authentication (no Safari redirect). */
  async signInWithOAuthNative(
    provider: 'google' | 'apple',
  ): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };

    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      const result =
        provider === 'google'
          ? await FirebaseAuthentication.signInWithGoogle()
          : await FirebaseAuthentication.signInWithApple();

      const firebaseUser = auth.currentUser;
      if (firebaseUser) {
        const session = buildVybeSessionInstant(firebaseUser);
        void enrichSessionToken(session, firebaseUser, 5000);
        return { data: { session }, error: null };
      }

      const idToken = result.credential?.idToken;
      if (!idToken) {
        return {
          data: { session: null },
          error: { message: `${provider === 'google' ? 'Google' : 'Apple'} sign-in did not return credentials` },
        };
      }

      const credential =
        provider === 'google'
          ? GoogleAuthProvider.credential(idToken, result.credential?.accessToken ?? undefined)
          : new OAuthProvider('apple.com').credential({
              idToken,
              rawNonce: result.credential?.nonce,
            });

      const userCred = await signInWithCredential(auth, credential);
      const session = buildVybeSessionInstant(userCred.user);
      void enrichSessionToken(session, userCred.user, 5000);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
  },

  /** Native Apple/Google link via Capacitor (Face ID / system sheet — no oauth:// web browser). */
  async linkWithOAuthNative(
    provider: 'google' | 'apple',
  ): Promise<{ data: { linked: boolean }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth?.currentUser) {
      return { data: { linked: false }, error: { message: 'Not authenticated', name: 'auth/not-authenticated' } };
    }

    try {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
      if (provider === 'apple') {
        await FirebaseAuthentication.linkWithApple();
      } else {
        await FirebaseAuthentication.linkWithGoogle();
      }
      return { data: { linked: true }, error: null };
    } catch (err) {
      return { data: { linked: false }, error: toAuthError(err) };
    }
  },

  /** Complete Google/Apple redirect sign-in after page reload (mobile / native WebView). */
  async completeOAuthRedirectIfNeeded(): Promise<{
    data: { session: VybeSession | null };
    error: VybeAuthError | null;
  }> {
    const { awaitOAuthRedirectCapture } = await import('./oauthRedirect');
    const captured = await awaitOAuthRedirectCapture();
    return { data: { session: captured.session }, error: captured.error };
  },

  // ---- Legacy Supabase auth methods (stubbed during Firebase migration) ----
  // These keep the codebase compiling; Phase 5 ports each caller to the proper
  // Firebase Auth flow (linkWithPopup, updateEmail, updatePassword, etc.).
  async signInWithOtp(_payload: { email?: string; phone?: string; options?: any }) {
    return { data: null, error: { message: 'signInWithOtp not supported on Firebase Auth — use email link or password instead' } };
  },
  async verifyOtp(_payload: { email?: string; phone?: string; token?: string; token_hash?: string; type: string }) {
    return { data: { session: null, user: null }, error: { message: 'verifyOtp not supported on Firebase Auth' } };
  },
  async linkIdentity(payload: { provider: string; options?: { redirectTo?: string; useRedirect?: boolean } }): Promise<{ data: any; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth?.currentUser) return { data: null, error: { message: 'Not authenticated' } };
    try {
      let provider: GoogleAuthProvider | OAuthProvider;
      if (payload.provider === 'google') {
        provider = new GoogleAuthProvider();
      } else if (payload.provider === 'apple') {
        provider = new OAuthProvider('apple.com');
      } else {
        return { data: null, error: { message: `Unsupported provider: ${payload.provider}` } };
      }

      if (payload.options?.useRedirect) {
        await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
        return { data: { redirected: true }, error: null };
      }

      const result = await linkWithPopup(
        auth.currentUser,
        provider,
        browserPopupRedirectResolver,
      );
      return { data: { user: toVybeUser(result.user) }, error: null };
    } catch (err) {
      const e = toAuthError(err);
      if (e.name === 'auth/credential-already-in-use') {
        return { data: null, error: { message: 'This account is already linked to another user.', name: e.name } };
      }
      if (e.name === 'auth/provider-already-linked') {
        return { data: null, error: { message: 'This provider is already linked to your account.', name: e.name } };
      }
      return { data: null, error: e };
    }
  },
  async unlinkIdentity(identity: { provider: string }): Promise<{ data: any; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth?.currentUser) return { data: null, error: { message: 'Not authenticated' } };
    try {
      const providerId =
        identity.provider === 'google' ? 'google.com'
          : identity.provider === 'apple' ? 'apple.com'
            : identity.provider;
      const result = await firebaseUnlink(auth.currentUser, providerId);
      return { data: { user: toVybeUser(result) }, error: null };
    } catch (err) {
      return { data: null, error: toAuthError(err) };
    }
  },
  async updateUser(attrs: { email?: string; password?: string; data?: Record<string, unknown> }): Promise<{ data: any; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: null, error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user) return { data: null, error: { message: 'Not authenticated' } };
    try {
      if (attrs.password) await firebaseUpdatePassword(user, attrs.password);
      if (attrs.data?.display_name) {
        await firebaseUpdateProfile(user, { displayName: String(attrs.data.display_name) });
      }
      return { data: { user: toVybeUser(user) }, error: null };
    } catch (err) {
      return { data: null, error: toAuthError(err) };
    }
  },
};

export type { VybeUser as User, VybeSession as Session };
