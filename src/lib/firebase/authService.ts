import {
  getAuth,
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
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import { isFirebaseConfigured } from './config';
import type { VybeSession, VybeUser, VybeAuthError } from './types';

let authInstance: ReturnType<typeof getAuth> | null = null;

const NOT_CONFIGURED: VybeAuthError = {
  message: 'Firebase is not configured. Set VITE_FIREBASE_* variables (see .env.example).',
  name: 'firebase/not-configured',
};

function resolveAuth(): ReturnType<typeof getAuth> | null {
  if (!isFirebaseConfigured()) return null;
  if (!authInstance) authInstance = getAuth(getFirebaseApp());
  return authInstance;
}

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

/** Fast path for login — cached token first, never blocks navigation. */
async function buildVybeSessionFast(user: FirebaseUser): Promise<VybeSession> {
  try {
    const token = await withAuthTimeout(
      user.getIdToken(false),
      4000,
      'Token fetch timed out',
    );
    return {
      user: toVybeUser(user),
      access_token: token,
      refresh_token: user.refreshToken,
    };
  } catch {
    return buildVybeSessionFallback(user);
  }
}

async function sessionFromCurrentUser(auth: ReturnType<typeof getAuth>): Promise<VybeSession | null> {
  const user = auth?.currentUser;
  if (!user) return null;
  return buildVybeSessionFast(user);
}

async function buildVybeSessionFallback(user: FirebaseUser): Promise<VybeSession> {
  let token = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      token = await user.getIdToken(attempt > 0);
      break;
    } catch {
      if (attempt < 2) await sleep(300 * (attempt + 1));
    }
  }
  return {
    user: toVybeUser(user),
    access_token: token,
    refresh_token: user.refreshToken,
  };
}

/** Never throw — password/OAuth sign-in must not fail after Firebase accepts credentials. */
async function toVybeSession(user: FirebaseUser): Promise<VybeSession> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await user.getIdTokenResult();
      return {
        user: toVybeUser(user),
        access_token: result.token,
        refresh_token: user.refreshToken,
        expires_at: result.expirationTime
          ? Math.floor(new Date(result.expirationTime).getTime() / 1000)
          : undefined,
      };
    } catch (err) {
      const authErr = toAuthError(err);
      if (attempt < 2 && isRetryableAuthNetworkError(authErr)) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      return buildVybeSessionFallback(user);
    }
  }
  return buildVybeSessionFallback(user);
}

type AuthStateCallback = (event: string, session: VybeSession | null) => void;

export const firebaseAuth = {
  get auth() {
    return resolveAuth();
  },

  async getSession(): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    const auth = resolveAuth();
    if (!auth) return { data: { session: null }, error: NOT_CONFIGURED };
    const user = auth.currentUser;
    if (!user) return { data: { session: null }, error: null };
    try {
      return { data: { session: await toVybeSession(user) }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
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
      await user.getIdToken(true);
      return { data: { session: await toVybeSession(user) }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
  },

  async exchangeCodeForSession(_code: string): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    return { data: { session: null }, error: { message: 'exchangeCodeForSession not supported on Firebase Auth — use email link or oauth flow' } };
  },

  onAuthStateChange(callback: AuthStateCallback) {
    const auth = resolveAuth();
    if (!auth) {
      callback('INITIAL_SESSION', null);
      return { data: { subscription: { unsubscribe: () => {} } } };
    }
    let initialFired = false;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      void (async () => {
        try {
          if (!initialFired) {
            initialFired = true;
            const session = user ? await toVybeSession(user) : null;
            callback('INITIAL_SESSION', session);
            return;
          }

          if (!user) {
            callback('SIGNED_OUT', null);
            return;
          }

          const session = await toVybeSession(user);
          callback('SIGNED_IN', session);
        } catch (err) {
          console.warn('[auth] onAuthStateChanged session build failed:', err);
          if (user) {
            callback(initialFired ? 'SIGNED_IN' : 'INITIAL_SESSION', await buildVybeSessionFallback(user));
          } else {
            callback('SIGNED_OUT', null);
          }
        }
      })();
    });

    return {
      data: {
        subscription: { unsubscribe },
      },
    };
  },

  async signUp(payload: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }) {
    const auth = resolveAuth();
    if (!auth) return { data: { user: null, session: null }, error: NOT_CONFIGURED };
    try {
      const username = payload.options?.data?.username as string | undefined;
      const cred = await createUserWithEmailAndPassword(auth, payload.email, payload.password);
      if (username) {
        await firebaseUpdateProfile(cred.user, { displayName: username });
      }
      await sendEmailVerification(cred.user);
      const session = await toVybeSession(cred.user);
      return {
        data: { user: toVybeUser(cred.user), session },
        error: null,
      };
    } catch (err) {
      return { data: { user: null, session: null }, error: toAuthError(err) };
    }
  },

  async signInWithPassword(payload: { email: string; password: string }) {
    const auth = resolveAuth();
    if (!auth) return { data: { user: null, session: null }, error: NOT_CONFIGURED };

    let lastErr: VybeAuthError | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cred = await withAuthTimeout(
          signInWithEmailAndPassword(auth, payload.email, payload.password),
          12000,
          'Sign-in timed out. Check your connection and try again.',
        );
        const session = await buildVybeSessionFast(cred.user);
        return {
          data: { user: toVybeUser(cred.user), session },
          error: null,
        };
      } catch (err) {
        lastErr = toAuthError(err);
        const recovered = await sessionFromCurrentUser(auth);
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

    const recovered = await sessionFromCurrentUser(auth);
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

  async signOut(options?: { scope?: 'local' | 'global' }) {
    const auth = resolveAuth();
    if (!auth) return { error: NOT_CONFIGURED };
    try {
      if (options?.scope === 'local') {
        return { error: null };
      }
      await firebaseSignOut(auth);
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    }
  },

  async setSession(_tokens: { access_token: string; refresh_token?: string }) {
    return this.getSession();
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
        await signInWithRedirect(auth, authProvider);
        return { data: { session: null }, error: null, redirected: true };
      }

      const result = await signInWithPopup(auth, authProvider);
      const session = await toVybeSession(result.user);
      return { data: { session }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
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
        await signInWithRedirect(auth, provider);
        return { data: { redirected: true }, error: null };
      }

      const result = await linkWithPopup(auth.currentUser, provider);
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
