import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile as firebaseUpdateProfile,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type User as FirebaseUser,
} from 'firebase/auth';
import { getFirebaseApp } from './app';
import type { VybeSession, VybeUser, VybeAuthError } from './types';

const auth = getAuth(getFirebaseApp());

function toVybeUser(user: FirebaseUser): VybeUser {
  return {
    id: user.uid,
    email: user.email,
    phone: user.phoneNumber,
    app_metadata: {},
    user_metadata: user.displayName ? { display_name: user.displayName, username: user.displayName } : {},
    created_at: user.metadata.creationTime || new Date().toISOString(),
    email_confirmed_at: user.emailVerified ? new Date().toISOString() : null,
  };
}

async function toVybeSession(user: FirebaseUser): Promise<VybeSession> {
  const token = await user.getIdToken();
  const result = await user.getIdTokenResult();
  return {
    user: toVybeUser(user),
    access_token: token,
    refresh_token: user.refreshToken,
    expires_at: result.expirationTime
      ? Math.floor(new Date(result.expirationTime).getTime() / 1000)
      : undefined,
  };
}

function toAuthError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; code?: string };
    return { message: e.message || 'Auth error', name: e.code };
  }
  return { message: 'Auth error' };
}

type AuthStateCallback = (event: string, session: VybeSession | null) => void;

export const firebaseAuth = {
  get auth() {
    return auth;
  },

  async getSession(): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
    const user = auth.currentUser;
    if (!user) return { data: { session: null }, error: null };
    try {
      return { data: { session: await toVybeSession(user) }, error: null };
    } catch (err) {
      return { data: { session: null }, error: toAuthError(err) };
    }
  },

  async getUser(): Promise<{ data: { user: VybeUser | null }; error: VybeAuthError | null }> {
    const user = auth.currentUser;
    if (!user) return { data: { user: null }, error: null };
    return { data: { user: toVybeUser(user) }, error: null };
  },

  async refreshSession(_opts?: { refresh_token?: string }): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null }> {
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
    let initialFired = false;
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
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
      callback('TOKEN_REFRESHED', session);
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
    try {
      const cred = await signInWithEmailAndPassword(auth, payload.email, payload.password);
      return {
        data: { user: toVybeUser(cred.user), session: await toVybeSession(cred.user) },
        error: null,
      };
    } catch (err) {
      return { data: { user: null, session: null }, error: toAuthError(err) };
    }
  },

  async resend(payload: { type: string; email: string; options?: { emailRedirectTo?: string } }) {
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
    try {
      const url = typeof redirect === 'string' ? redirect : redirect?.redirectTo;
      await sendPasswordResetEmail(auth, email, url ? { url } : undefined);
      return { error: null };
    } catch (err) {
      return { error: toAuthError(err) };
    }
  },
  async signInWithOAuth(
    provider: 'google' | 'apple',
    opts?: { extraParams?: Record<string, string>; useRedirect?: boolean }
  ): Promise<{ data: { session: VybeSession | null }; error: VybeAuthError | null; redirected?: boolean }> {
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

  // ---- Legacy Supabase auth methods (stubbed during Firebase migration) ----
  // These keep the codebase compiling; Phase 5 ports each caller to the proper
  // Firebase Auth flow (linkWithPopup, updateEmail, updatePassword, etc.).
  async signInWithOtp(_payload: { email?: string; phone?: string; options?: any }) {
    return { data: null, error: { message: 'signInWithOtp not supported on Firebase Auth — use email link or password instead' } };
  },
  async verifyOtp(_payload: { email?: string; phone?: string; token: string; type: string }) {
    return { data: { session: null, user: null }, error: { message: 'verifyOtp not supported on Firebase Auth' } };
  },
  async linkIdentity(_payload: { provider: string; options?: any }): Promise<{ data: any; error: VybeAuthError | null }> {
    return { data: null, error: { message: 'linkIdentity not yet ported to Firebase Auth' } };
  },
  async unlinkIdentity(_identity: any): Promise<{ data: any; error: VybeAuthError | null }> {
    return { data: null, error: { message: 'unlinkIdentity not yet ported to Firebase Auth' } };
  },
  async updateUser(_attrs: { email?: string; password?: string; data?: Record<string, unknown> }): Promise<{ data: any; error: VybeAuthError | null }> {
    return { data: null, error: { message: 'updateUser not yet ported — use Firebase updateEmail/updatePassword/updateProfile directly' } };
  },
};

export type { VybeUser as User, VybeSession as Session };
