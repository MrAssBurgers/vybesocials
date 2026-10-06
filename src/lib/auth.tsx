import { createContext, lazy, Suspense, useContext, useEffect, useMemo, useState, useRef, useCallback, useSyncExternalStore, ReactNode } from 'react';
import type { User, Session } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { updateUserProfile, ensureUserProfile } from '@/lib/firebase/users';
import { profileAccountGuard, withProfileSetupDeadline, profileSetupFailure } from '@/lib/profileAccountGuard';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import type { ProfileSetupError } from '@/lib/accountProfileService';
import { setCachedProfile, setCachedCurrentProfile, clearCachedCurrentProfile, clearProfileCache, setActiveAuthUserId, stripStaleOnboardingFlagFromDisk } from '@/lib/profileCache';
import { clearCachedUserLevel } from '@/lib/userLevelCache';
import { prefetchDMConversationsFromNav } from '@/lib/loadDMConversations';
import { warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { resetSessionProfileMemo } from '@/lib/resolveSessionProfileId';
import { resetThemeToDefault } from '@/lib/themeReset';
import { hasStoredAuthSession, getStoredAuthUserId, clearObsoleteAuthStorage } from '@/lib/legacyAuthStorage';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';
import { clearFunctionAuthHeadersCache } from '@/lib/functionAuth';
import { logEvent } from '@/lib/debugLogger';
import {
  normalizeUsername,
  stashSignupUsername,
} from '@/lib/username';
import { startHeartbeat, stopHeartbeat } from '@/lib/analytics';
import { removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { pickActiveBan } from '@/lib/banUtils';
import { normalizeLoginEmail } from '@/lib/loginEmail';
import { cacheProfileAvatar, resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from '@/lib/passwordRecoveryUrl';
import { awaitOAuthRedirectCapture, clearOAuthRedirectPending, isLikelyFirebaseOAuthReturnUrl, isOAuthRedirectInFlight, recoverOAuthSessionIfSignedIn } from '@/lib/firebase/oauthRedirect';
import { isDespiaOAuthInFlight } from '@/lib/despiaOAuth';
import { tokenAccountGuard, tokenAccountSnapshot } from '@/lib/tokenMarketplaceService';
import { beginLoginApprovalCheck, endLoginApprovalCheck, shouldBlockPostLoginNavigation } from '@/lib/loginApprovalGate';
import { captureAuthSnapshotGuard, completeAuthConfirmation, createAuthAttemptController, isRetiredAuthAttempt, type AuthSessionAttempt } from '@/lib/authSessionAttempt';
import { getFirebaseAuth, getAuthRestoreState, subscribeAuthRestoreState } from '@/lib/firebase/authService';

const BannedScreen = lazy(() => import('@/components/auth/BannedScreen').then(module => ({ default: module.BannedScreen })));
const MemeBanScreen = lazy(() => import('@/components/auth/MemeBanScreen').then(module => ({ default: module.MemeBanScreen })));

// Token refresh interval - refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

function getStoredSessionRefreshTimeoutMs(): number {
  return isDespiaRuntime() ? 15000 : 8000;
}

function getAuthInitTimeouts() {
  const oauthInFlight =
    isOAuthRedirectInFlight() ||
    isDespiaOAuthInFlight() ||
    isLikelyFirebaseOAuthReturnUrl();
  if (oauthInFlight) {
    return { safetyMs: 10000, getSessionMs: 8000 };
  }
  return { safetyMs: 2500, getSessionMs: 2000 };
}

function isFatalRefreshError(message: string): boolean {
  const msg = (message || '').toLowerCase();
  // Only treat refresh-token/session revocation as fatal — not generic "expired"
  // (access JWT expiry is normal and refreshSession should recover).
  return (
    msg.includes('invalid refresh token') ||
    msg.includes('refresh token not found') ||
    msg.includes('refresh_token_not_found') ||
    msg.includes('refresh token has been revoked') ||
    msg.includes('session not found') ||
    msg.includes('session_not_found') ||
    msg.includes('user from sub claim') ||
    msg.includes('user not found') ||
    (msg.includes('refresh') && msg.includes('already been used')) ||
    (msg.includes('refresh') && msg.includes('invalid')) ||
    (msg.includes('refresh') && msg.includes('not found'))
  );
}

async function refreshStoredSession(timeoutMs = getStoredSessionRefreshTimeoutMs()) {
  return refreshFirebaseSession(timeoutMs);
}

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  interests?: string[] | null;
  onboarding_completed?: boolean | null;
  is_private?: boolean | null;
  is_verified?: boolean | null;
  badge_settings?: Record<string, boolean> | null;
}

interface BanInfo {
  reason: string;
  expires_at: string | null;
  is_permanent: boolean;
  is_meme_ban?: boolean | null;
  custom_gif_url?: string | null;
}

export interface ApplySessionResult {
  requiresApproval: boolean;
  requiresEmail2fa?: boolean;
  challengeId?: string;
  expiresAt?: string;
  deviceLabel?: string;
  geo?: {
    city?: string | null;
    country?: string | null;
    region?: string | null;
    ip?: string | null;
  };
}
export type SignInConfirmation = { emailChallengeId?: string; guard?: () => void };

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authReady: boolean;
  banInfo: BanInfo | null;
  profileSetupError: ProfileSetupError | null;
  profileSetupLoading: boolean;
  retryProfileSetup: () => Promise<void>;
  recoverProfileSetup: () => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<{
    error: Error | null;
    needsEmailConfirmation?: boolean;
    verificationEmailSent?: boolean;
  }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null; requiresApproval?: boolean; requiresEmail2fa?: boolean } & Partial<ApplySessionResult>>;
  /** Apply Firebase OAuth session immediately (popup / redirect completion). */
  applyOAuthSession: (session: Session, method?: string, confirmation?: SignInConfirmation) => Promise<ApplySessionResult>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<Profile | null | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function persistCurrentProfile(profileData: Profile, guard: () => void = () => {}) {
  guard();
  cacheProfileAvatar(profileData.id, profileData.avatar_url);
  const payload = {
    id: profileData.id,
    user_id: profileData.user_id,
    username: profileData.username,
    display_name: profileData.display_name || null,
    avatar_url: profileData.avatar_url,
    bio: profileData.bio,
    onboarding_completed: profileData.onboarding_completed === true ? true : profileData.onboarding_completed,
  };
  setCachedProfile(payload);
  setCachedCurrentProfile(payload);
  requestAnimationFrame(() => {
    try { guard(); } catch { return; }
    prefetchDMConversationsFromNav();
    const qc = (window as any).__REACT_QUERY_CLIENT__;
    if (qc && profileData.id && profileData.user_id) {
      warmHomeCachesForProfile(qc, profileData.user_id, profileData.id, profileData as unknown as Record<string, unknown>);
    }
  });
}

/** Wait until auth session exists (post-signup / OAuth race). */
export async function waitForAuthSession(timeoutMs = 2500): Promise<Session | null> {
  const initial = (await db.auth.getSession()).data.session;
  if (initial?.user) return initial;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (session: Session | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
      resolve(session);
    };

    const timer = setTimeout(async () => {
      const { data: { session } } = await db.auth.getSession();
      finish(session?.user ? session : null);
    }, timeoutMs);

    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        finish(session);
      }
    });
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const accountSession = useReportAccountSession();
  const authRestoreState = useSyncExternalStore(subscribeAuthRestoreState, getAuthRestoreState, getAuthRestoreState);
  const [setupState, setSetupState] = useState<{ uid: string; epoch: number; loading: boolean; error: ProfileSetupError | null } | null>(null);
  const profileScopeRef = useRef<{ uid: string; epoch: number } | null>(null);
  const profileAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const providerLifetimeRef = useRef(0);
  const pendingSignupRef = useRef<symbol | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banExpiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banSubscriptionRef = useRef<ReturnType<typeof db.channel> | null>(null);
  // Prevent double-triggering from onAuthStateChange + getSession running simultaneously
  const authInitializedRef = useRef(false);
  const explicitSignOutRef = useRef(false);
  const bootstrapUserRef = useRef<string | null>(null);
  const bootstrapRetryRef = useRef<string | null>(null);
  const bootstrapRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authAttempts = useRef(createAuthAttemptController(tokenAccountSnapshot, {
    begin: beginLoginApprovalCheck, end: endLoginApprovalCheck,
  })).current;

  // Reject stale cached profile when auth user changes (wrong-user queries break RLS).
  useEffect(() => {
    setActiveAuthUserId(user?.id ?? null);
    if (!user?.id) {
      resetSessionProfileMemo();
      return;
    }
    setProfile((prev) => {
      if (!prev) return prev;
      if (prev.user_id !== user.id || profileScopeRef.current?.epoch !== accountSession.epoch) return null;
      return prev;
    });
  }, [user?.id, accountSession.epoch]);

  // Clear ban expiry timer
  const clearBanExpiryTimer = () => {
    if (banExpiryTimerRef.current) {
      clearTimeout(banExpiryTimerRef.current);
      banExpiryTimerRef.current = null;
    }
  };

  // Schedule auto-unban when ban expires
  const scheduleBanExpiry = (expiresAt: string | null, isPermanent: boolean, guard: () => void = () => {}) => {
    clearBanExpiryTimer();
    
    if (isPermanent || !expiresAt) return;
    
    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;
    
    if (timeUntilExpiry <= 0) {
      // Already expired, clear ban immediately
      setBanInfo(null);
      return;
    }
    
    // Schedule the unban
    banExpiryTimerRef.current = setTimeout(() => {
      try { guard(); } catch { return; }
      setBanInfo(null);
    }, timeUntilExpiry);
  };

  // Check if user is banned
  const checkBanStatus = async (profileId: string, guard: () => void = tokenAccountGuard()) => {
    try { guard(); } catch { return; }
    const { data, error } = await db
      .from('user_bans')
      .select('reason, expires_at, is_permanent, is_meme_ban, custom_gif_url')
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(10);

    try { guard(); } catch { return; }

    const activeBan = !error ? pickActiveBan(data ?? []) : null;

    if (activeBan) {
      setBanInfo({ ...activeBan, reason: activeBan.reason || 'No reason provided' } as BanInfo);
      // Schedule auto-unban when time is up
      scheduleBanExpiry(activeBan.expires_at, activeBan.is_permanent, guard);
    } else {
      setBanInfo(null);
      clearBanExpiryTimer();
    }
  };

  // Subscribe to realtime ban changes (single channel per profile — see realtimeChannel.ts)
  const subscribeToBanChanges = (profileId: string, guard: () => void = tokenAccountGuard()) => {
    removeRealtimeChannel(banSubscriptionRef.current);
    banSubscriptionRef.current = null;

    banSubscriptionRef.current = subscribePostgresChannel(
      `ban-status-${profileId}`,
      [
        {
          event: '*',
          table: 'user_bans',
          filter: `user_id=eq.${profileId}`,
          callback: () => {
            void checkBanStatus(profileId, guard);
          },
        },
      ],
    );
  };

  // Schedule token refresh before expiry
  const scheduleTokenRefresh = (expiresAt: number, retryAttempt = 0, retryDelayMs?: number) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    const firebaseUser = getFirebaseAuth()?.currentUser;
    const snapshot = tokenAccountSnapshot();
    if (!firebaseUser || firebaseUser.uid !== snapshot.uid) return;
    const accountGuard = captureAuthSnapshotGuard(tokenAccountSnapshot, firebaseUser.uid);
    const lifetime = providerLifetimeRef.current;
    const guard = () => {
      accountGuard();
      if (!mountedRef.current || providerLifetimeRef.current !== lifetime || getFirebaseAuth()?.currentUser !== firebaseUser) throw new Error('Session refresh retired.');
    };

    const expiresAtMs = expiresAt * 1000;
    const now = Date.now();
    const refreshAt = expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
    const delay = retryDelayMs ?? Math.max(refreshAt - now, 1000); // At least 1 second delay
    const retry = () => {
      guard();
      scheduleTokenRefresh(expiresAt, retryAttempt + 1, Math.min(2000 * 2 ** Math.min(retryAttempt, 4), 30000));
    };

    // Only schedule if token expires in the future
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) { // Max 24 hours
      refreshTimerRef.current = setTimeout(async () => {
        try {
          guard();
          refreshTimerRef.current = null;
          if (document.visibilityState !== 'visible' || navigator.onLine === false) {
            scheduleTokenRefresh(expiresAt, retryAttempt, 30000);
            return;
          }
          const { data, error } = await refreshFirebaseSession();
          guard();
          if (error) {
            console.error('Token refresh failed:', error);
            if (isFatalRefreshError(error.message)) {
              // Refresh token is invalid/expired — clear session so the user
              // can sign back in and reload data (instead of being stuck with
              // a cached profile and 401s on every request).
              try {
                await db.auth.signOut({ scope: 'local', guard });
              } catch { /* ignore */ }
              const after = tokenAccountSnapshot();
              if (!mountedRef.current || providerLifetimeRef.current !== lifetime || getFirebaseAuth()?.currentUser || after.uid || after.epoch > snapshot.epoch + 1) return;
              setSession(null);
              setUser(null);
              setProfile(null);
              clearProfileCache();
            } else retry();
          } else if (data.session?.expires_at) {
            // Schedule next refresh
            scheduleTokenRefresh(data.session.expires_at);
          }
        } catch (err) {
          try { guard(); } catch { return; }
          console.error('Token refresh error:', err);
          retry();
        }
      }, delay);
    }
  };

  // Note: Referral/invite popup is now handled entirely by InvitePopup component
  // using the referral.ts utilities with localStorage persistence

  const acceptConfirmedProfile = (profileData: import('@/lib/firebase/types').UserProfile, userId: string, guard: () => void) => {
    guard();
    if (profileData.user_id !== userId || !profileData.id) throw new Error('Profile ownership could not be confirmed.');
    const confirmed = { ...profileData, ...(!profileData.username ? { onboarding_completed: false } : {}), avatar_url: profileData.avatar_url ?? null, bio: profileData.bio ?? '', created_at: profileData.created_at ?? '' } as Profile;
    profileScopeRef.current = { uid: userId, epoch: reportAccountSnapshot().epoch };
    setProfile(confirmed);
    setSetupState({ ...profileScopeRef.current, loading: false, error: null });
    resetSessionProfileMemo();
    persistCurrentProfile(confirmed, guard);
    void checkBanStatus(confirmed.id, guard);
    subscribeToBanChanges(confirmed.id, guard);
    return confirmed;
  };

  const fetchProfile = async (userId: string, _retryCount = 0, outerGuard: () => void = profileAccountGuard(userId), action: 'ensure' | 'recover' = 'ensure', defaults?: Partial<import('@/lib/firebase/types').UserProfile>, preserveConfirmedOnFailure = false) => {
    try { outerGuard(); } catch { return null; }
    if (!mountedRef.current) return null;
    const captured = reportAccountSnapshot();
    const lifetime = providerLifetimeRef.current;
    const attempt = ++profileAttemptRef.current;
    const accountGuard = profileAccountGuard(userId);
    const guard = () => {
      outerGuard(); accountGuard();
      if (!mountedRef.current || lifetime !== providerLifetimeRef.current || attempt !== profileAttemptRef.current) throw Object.assign(new Error('Profile setup was replaced.'), { code: 'account-changed' });
    };
    if (bootstrapRetryTimerRef.current !== null) {
      clearTimeout(bootstrapRetryTimerRef.current);
      bootstrapRetryTimerRef.current = null;
    }
    try {
      guard();
      bootstrapRetryRef.current = null;
      setSetupState({ uid: userId, epoch: captured.epoch, loading: true, error: null });
      const profileData = await withProfileSetupDeadline(async current => {
        const { provisionAccountProfile } = await import('@/lib/accountProfileService');
        current();
        return action === 'recover'
          ? (await provisionAccountProfile(userId, { action }, current)).profile
          : await ensureUserProfile(userId, defaults, current);
      }, guard);
      guard();
      return acceptConfirmedProfile(profileData, userId, guard);
    } catch (error) {
      try { guard(); } catch { return null; }
      const failure = error as { code?: string; name?: string; message?: string };
      const failureCode = String(failure?.code || failure?.name || '').replace(/^(?:functions|auth)\//, '');
      const transient = ['unavailable', 'deadline-exceeded', 'network-request-failed'].includes(failureCode) || (error instanceof TypeError && /fetch|network/i.test(error.message));
      // A failed network bootstrap must not suppress the next successful
      // same-account token event. The attempt/lifetime guards above prevent
      // retired work from releasing another account's bootstrap latch.
      let retryScheduled = false;
      if (transient && !preserveConfirmedOnFailure && bootstrapUserRef.current === `${userId}:${captured.epoch}`) {
        bootstrapUserRef.current = null;
        bootstrapRetryRef.current = `${userId}:${captured.epoch}`;
        // A brief token-fetch failure may recover without an online/token event.
        // Retry only this checked startup, twice; never retry ownership rejection
        // or restart a replacement account, manual attempt or provider lifetime.
        if (action === 'ensure' && _retryCount < 2 && !shouldBlockPostLoginNavigation() && navigator.onLine !== false && document.visibilityState !== 'hidden') {
          const key = bootstrapRetryRef.current;
          retryScheduled = true;
          bootstrapRetryTimerRef.current = setTimeout(() => {
            bootstrapRetryTimerRef.current = null;
            try { guard(); } catch { return; }
            if (bootstrapRetryRef.current !== key) return;
            if (shouldBlockPostLoginNavigation() || navigator.onLine === false || document.visibilityState === 'hidden') {
              setSetupState({ uid: userId, epoch: captured.epoch, loading: false, error: profileSetupFailure(error) });
              return;
            }
            bootstrapUserRef.current = key;
            void fetchProfile(userId, _retryCount + 1, outerGuard, action, defaults);
          }, _retryCount === 0 ? 1000 : 3000);
        }
      }
      const preserve = transient && preserveConfirmedOnFailure && profileScopeRef.current?.uid === userId && profileScopeRef.current.epoch === captured.epoch;
      if (!preserve) { profileScopeRef.current = null; setProfile(null); }
      // Keep brief network recovery continuous, but a full deadline must
      // expose recovery controls immediately instead of extending the spinner.
      const recovering = retryScheduled && failureCode !== 'deadline-exceeded';
      setSetupState({ uid: userId, epoch: captured.epoch, loading: recovering, error: preserve || recovering ? null : profileSetupFailure(error) });
      return null;
    }
  };

  /** A single checked profile bootstrap; ordinary reads never create or relink identity. */
  const bootstrapSessionData = (userId: string, _authEvent: string, guard: () => void = profileAccountGuard(userId)) => {
    try { guard(); } catch { return; }
    if (pendingSignupRef.current) return;
    const key = `${userId}:${reportAccountSnapshot().epoch}`;
    // SDK restore/sign-in notifications can describe the same account epoch.
    // Restarting replaces the first valid reply and holds posts behind a second
    // request. Explicit refresh/recovery still run their own checked attempts.
    if (bootstrapUserRef.current === key) return;
    bootstrapUserRef.current = key;
    const lifetime = providerLifetimeRef.current;
    queueMicrotask(() => {
      if (!mountedRef.current || lifetime !== providerLifetimeRef.current) return;
      try { guard(); } catch { return; }
      void fetchProfile(userId, 0, guard);
    });
  };

  /** Drop local session while a login-approval challenge is pending (tokens must not unlock the app). */
  const softSignOutForLoginApproval = useCallback(async (attempt: AuthSessionAttempt) => {
    attempt.guard();
    explicitSignOutRef.current = true;
    clearFunctionAuthHeadersCache();
    setWasLoggedIn(false);
    setProfile(null);
    setUser(null);
    setSession(null);
    clearCachedCurrentProfile();
    clearCachedUserLevel();
    stopHeartbeat();
    const result = await db.auth.signOut({ scope: 'local', guard: attempt.guard });
    if (result.error) throw result.error;
    // Firebase sign-out intentionally changes the account epoch. Only this
    // attempt may continue cleanup, and it must still be signed out.
    attempt.signedOut();
    // Allow a later custom-token sign-in after approval.
    window.setTimeout(() => {
      if (attempt.isCurrent()) explicitSignOutRef.current = false;
    }, 1500);
  }, []);

  const applyOAuthSession = useCallback(async (oauthSession: Session, method = 'oauth', existingAttempt?: AuthSessionAttempt, confirmation?: SignInConfirmation): Promise<ApplySessionResult> => {
    const needsConfirmation = method !== 'login_approval' && method !== 'email_2fa';
    confirmation?.guard?.();
    const baseAttempt = existingAttempt ?? authAttempts.start(oauthSession.user.id);
    const guard = () => { confirmation?.guard?.(); baseAttempt.guard(); };
    const attempt: AuthSessionAttempt = { ...baseAttempt, guard, isCurrent: () => { try { guard(); return true; } catch { return false; } } };
    attempt.guard();
    explicitSignOutRef.current = false;
    clearOAuthRedirectPending();
    let confirmedProfile: import('@/lib/firebase/types').UserProfile | null = null;

    // Interactive sign-ins: check login confirmation BEFORE hydrating React auth
    // so Landing / RootGate cannot navigate into the app early.
    const gate = await completeAuthConfirmation<ApplySessionResult>(attempt, {
      check: async guard => {
        const { beginEmailConfirmation, withSignInCheckDeadline } = await import('@/lib/emailConfirmation');
        guard();
        return withSignInCheckDeadline(guard, async current => {
          if (needsConfirmation) {
            const emailGate = await beginEmailConfirmation(oauthSession.user.id, current);
            current();
            if (emailGate) return { requiresApproval: false, requiresEmail2fa: true, ...emailGate };
          }

          // Existing migrated accounts need a checked canonical binding before
          // device registration. Keep this result private until confirmation.
          try { confirmedProfile = await ensureUserProfile(oauthSession.user.id, undefined, current); }
          catch (error) {
            current();
            const failure = error as { details?: { reason?: unknown } };
            if (failure.details?.reason === 'profile-recovery-required') throw Object.assign(new Error('Your profile needs an account ownership review before sign-in can finish. Contact support, or retry after the review is complete.'), { code: 'auth/profile-recovery-required' });
            throw error;
          }
          current();
          if (!confirmedProfile?.id || confirmedProfile.user_id !== oauthSession.user.id) throw new Error('Profile ownership could not be confirmed.');

          const { notifyFreshLogin } = await import('@/hooks/useSessionTracking');
          current();
          // The modal owns clearing its pending gate after this entire guarded
          // completion. Clearing it here would unmount a switched-to-email view.
          const result = await notifyFreshLogin(method, current, confirmation?.emailChallengeId, true);
          current();
          if (result.requiresApproval) {
            if (!needsConfirmation) throw new Error('This sign-in has not been confirmed. Please sign in again.');
            return { requiresApproval: true, challengeId: result.challengeId, expiresAt: result.expiresAt, deviceLabel: result.deviceLabel, geo: result.geo };
          }
          return null;
        });
      },
      signOut: () => softSignOutForLoginApproval(attempt),
      hydrate: () => {
        attempt.guard();
        setWasLoggedIn(true);
        setSession(oauthSession);
        setUser(oauthSession.user);
        setActiveAuthUserId(oauthSession.user.id);
        authInitializedRef.current = true;
        setLoading(false);
        setIsInitialized(true);
        startHeartbeat();
        if (oauthSession.expires_at) scheduleTokenRefresh(oauthSession.expires_at);
        if (!confirmedProfile) throw new Error('Profile ownership could not be confirmed.');
        ++profileAttemptRef.current;
        bootstrapUserRef.current = `${oauthSession.user.id}:${reportAccountSnapshot().epoch}`;
        acceptConfirmedProfile(confirmedProfile, oauthSession.user.id, attempt.guard);
        void db.auth.refreshSession().catch(() => {});
      },
    });
    attempt.guard();
    if (gate) return gate;

    return { requiresApproval: false };
  }, [authAttempts, softSignOutForLoginApproval]);

  useEffect(() => {
    // ──────────────────────────────────────────────────────────────────────
    // STEP 0: Explicitly extract OAuth tokens from URL hash.
    // On mobile/tablet (redirect flow), the OAuth broker redirects back
    // with #access_token=...&refresh_token=... in the URL. Supabase's
    // detectSessionInUrl should handle this, but on many mobile browsers
    // a race condition causes the tokens to be missed. We extract them
    // manually and call setSession() BEFORE any other auth logic runs.
    // ──────────────────────────────────────────────────────────────────────
    const extractHashTokens = async () => {
      const hash = window.location.hash;

      // Recovery links must land on /reset-password — never consume as OAuth login.
      try {
        if (isPasswordRecoveryUrl(new URL(window.location.href))) {
          redirectToPasswordRecoveryPage();
          return false;
        }
      } catch {
        /* ignore */
      }

      if (!hash || !hash.includes('access_token')) return false;

      try {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');
        const type = params.get('type');

        if (type === 'recovery') {
          redirectToPasswordRecoveryPage();
          return false;
        }

        if (access_token && refresh_token) {
          logEvent('auth', 'Hash tokens detected — manually setting session');
          
          // Clean hash from URL immediately to prevent re-processing
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          
          const { error } = await db.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            logEvent('auth', 'setSession from hash failed', { error: error.message });
            console.error('[Auth] Failed to set session from hash tokens:', error);
            return false;
          }

          logEvent('auth', 'Session set from hash tokens successfully');
          clearOAuthRedirectPending();
          return true;
        }
      } catch (err) {
        console.error('[Auth] Hash token extraction error:', err);
      }
      return false;
    };

    mountedRef.current = true;
    // Helper: check if there's a stored auth token (session might be refreshing)
    const hasStoredToken = () => hasStoredAuthSession();

    const hydrateCachedProfile = (_userId = '') => {
      // A stored display snapshot cannot establish current profile ownership.
      // The checked bootstrap is responsible for restoring an owned profile.
      return false;
    };

    if (hasStoredToken()) {
      // Profile hydrate runs once auth user id is known (onAuthStateChange / getSession).
    }

    // Never block launch if getSession / refresh hangs (App Review 2.1a iPad).
    const { safetyMs, getSessionMs } = getAuthInitTimeouts();
    const authSafetyTimeout = window.setTimeout(() => {
      if (authInitializedRef.current) return;
      logEvent('auth', 'Auth restore still pending — showing recovery controls');
      setLoading(false);
    }, safetyMs);

    // Set up auth state listener FIRST
    const { data: { subscription } } = db.auth.onAuthStateChange(
      async (event, session) => {
        logEvent('auth', `onAuthStateChange: ${event}`, { hasSession: !!session });

        if (event === 'PASSWORD_RECOVERY') {
          redirectToPasswordRecoveryPage();
          setLoading(false);
          setIsInitialized(true);
          authInitializedRef.current = true;
          return;
        }

        const eventGuard = captureAuthSnapshotGuard(tokenAccountSnapshot, session?.user?.id);
        try { eventGuard(); } catch { return; }

        // First-factor/custom-token SDK events arrive before the interactive
        // confirmation receipt. Only its guarded completion may hydrate them.
        if (session?.user && shouldBlockPostLoginNavigation()) return;

        if (event === 'SIGNED_IN' && session?.user) {
          stripStaleOnboardingFlagFromDisk();
          clearObsoleteAuthStorage();
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setSession(session);
          if (session.access_token) {
            try {
              db.realtime.setAuth(session.access_token);
            } catch { /* noop */ }
          }
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          if (bootstrapRetryRef.current === `${session.user.id}:${reportAccountSnapshot().epoch}`) {
            bootstrapSessionData(session.user.id, event, eventGuard);
          }
          return;
        }

        // The adapter withholds native/SDK provisional nulls. Only its settled
        // empty result may unlock the sign-in surface.
        if (event === 'INITIAL_SESSION' && !session) {
          if (getAuthRestoreState() !== 'ready') return;
          logEvent('auth', 'INITIAL_SESSION settled without a session');
          if (!authInitializedRef.current) {
            authInitializedRef.current = true;
            setLoading(false);
            setIsInitialized(true);
          }
          return;
        }

        if (event === 'INITIAL_SESSION' && session?.user) {
          setLoading(false);
          setIsInitialized(true);
          authInitializedRef.current = true;
        }
        
        setSession(session);
        setUser(session?.user ?? null);

        // Diagnostics must not hold profile loading behind another chunk fetch.
        // A late module still belongs to this exact account/provider lifetime.
        const diagnosticLifetime = providerLifetimeRef.current;
        void (async () => {
          const { setSentryUser } = await import('@/lib/sentry');
          if (!mountedRef.current || providerLifetimeRef.current !== diagnosticLifetime) return;
          eventGuard();
          setSentryUser(session?.user ? { id: session.user.id, username: session.user.email ?? undefined } : null);
        })().catch(() => { /* Diagnostics cannot block session restoration. */ });
        try { eventGuard(); } catch { return; }

        // Keep the Realtime socket authenticated so RLS-filtered postgres_changes
        // events (e.g. DM INSERT on `messages`) actually reach the client.
        try {
          if (session?.access_token) {
            db.realtime.setAuth(session.access_token);
          }
        } catch { /* noop */ }

        if (session?.user) {
          setWasLoggedIn(true);
          const prevAuthId = getStoredAuthUserId();
          setActiveAuthUserId(session.user.id);
          if (prevAuthId && prevAuthId !== session.user.id) {
            clearCachedCurrentProfile();
            resetSessionProfileMemo();
          }
          logEvent('auth', 'Session active, fetching profile', { userId: session.user.id });
          startHeartbeat();
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }

          /* hydrateCachedProfile handled by listener */
          bootstrapSessionData(session.user.id, event);

          clearOAuthRedirectPending();
        } else if (event === 'SIGNED_OUT') {
          if (!explicitSignOutRef.current && hasStoredAuthSession()) {
            logEvent('auth', 'SIGNED_OUT with stored token — attempting recovery');
            const { data: recovered, error: recoverError } = await refreshStoredSession(
              getStoredSessionRefreshTimeoutMs() + 4000,
            );
            // A successful recovery gets its own current Auth event. This old
            // signed-out callback must not overwrite it (or another account).
            try { eventGuard(); } catch { return; }
            if (recovered.session?.user) {
              logEvent('auth', 'Recovered session after unexpected SIGNED_OUT', {
                userId: recovered.session.user.id,
              });
              setWasLoggedIn(true);
              setSession(recovered.session);
              setUser(recovered.session.user);
              setActiveAuthUserId(recovered.session.user.id);
              hydrateCachedProfile(recovered.session.user.id);
              if (recovered.session.expires_at) {
                scheduleTokenRefresh(recovered.session.expires_at);
              }
              bootstrapSessionData(recovered.session.user.id, 'TOKEN_REFRESHED');
              setLoading(false);
              setIsInitialized(true);
              authInitializedRef.current = true;
              return;
            }
            if (!recoverError || !isFatalRefreshError(recoverError.message)) {
              logEvent('auth', 'Keeping stored token after SIGNED_OUT (transient refresh failure)');
              hydrateCachedProfile();
              setLoading(false);
              setIsInitialized(true);
              authInitializedRef.current = true;
              return;
            }
          }

          explicitSignOutRef.current = false;
          setWasLoggedIn(false);
          setActiveAuthUserId(null);
          resetSessionProfileMemo();
          logEvent('auth', 'Sign out — clearing state');
          setProfile(null);
          clearCachedCurrentProfile();
          clearCachedUserLevel();
          stopHeartbeat();
          setBanInfo(null);
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
          }
          if (banSubscriptionRef.current) {
            db.removeChannel(banSubscriptionRef.current);
            banSubscriptionRef.current = null;
          }
          clearBanExpiryTimer();
        }
        
        // Only mark initialized from onAuthStateChange for events that carry
        // definitive session state (not INITIAL_SESSION which we skip above)
        if (event !== 'INITIAL_SESSION') {
          setLoading(false);
          setIsInitialized(true);
          authInitializedRef.current = true;
        }
      }
    );

    let lastResumeRefreshAt = 0;
    const resumeRefresh = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      const sdkUser = getFirebaseAuth()?.currentUser;
      if (!sdkUser && !hasStoredAuthSession()) return;
      const lifetime = providerLifetimeRef.current;
      const accountGuard = sdkUser ? captureAuthSnapshotGuard(tokenAccountSnapshot, sdkUser.uid) : null;
      const guard = () => {
        if (!mountedRef.current || providerLifetimeRef.current !== lifetime || getFirebaseAuth()?.currentUser !== sdkUser) throw new Error('Resume refresh retired.');
        accountGuard?.();
      };

      const now = Date.now();
      const debounceMs = 2000;
      if (now - lastResumeRefreshAt < debounceMs) return;
      lastResumeRefreshAt = now;

      void db.auth.getSession().then(({ data: { session } }) => {
        guard();
        if (sdkUser && session?.user && session.user.id !== sdkUser.uid) return;
        if (session?.user && session.expires_at) {
          const expiresMs = session.expires_at * 1000;
          if (expiresMs - Date.now() > 5 * 60 * 1000) {
            // Reconnecting with a still-valid token does not emit a Firebase
            // token event. Retry only the transient bootstrap belonging to
            // this exact account; authoritative failures remain actionable.
            if (sdkUser && !shouldBlockPostLoginNavigation() && bootstrapRetryRef.current === `${sdkUser.uid}:${reportAccountSnapshot().epoch}`) {
              bootstrapSessionData(sdkUser.uid, 'RESUMED', guard);
            }
            return;
          }
        }
        if (sdkUser) scheduleTokenRefresh(session?.expires_at ?? Date.now() / 1000);
        else if (!session?.user) void refreshFirebaseSession().catch(() => {});
      }).catch(() => {
        try { guard(); } catch { return; }
        if (sdkUser) scheduleTokenRefresh(Date.now() / 1000);
      });
    };
    document.addEventListener('visibilitychange', resumeRefresh);
    window.addEventListener('app-resumed', resumeRefresh);
    window.addEventListener('online', resumeRefresh);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resumeRefresh();
    };
    window.addEventListener('pageshow', onPageShow);

    // Firebase Google/Apple redirect — listener is registered above; then capture redirect result.
    void (async () => {
      let captured = await awaitOAuthRedirectCapture();
      const shouldRecoverOAuth =
        isOAuthRedirectInFlight() || isLikelyFirebaseOAuthReturnUrl();
      if (!captured.session?.user && !captured.error && shouldRecoverOAuth) {
        const maxAttempts = isLikelyFirebaseOAuthReturnUrl() ? 24 : 12;
        for (let attempt = 0; attempt < maxAttempts && !captured.session?.user; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          captured = await recoverOAuthSessionIfSignedIn();
        }
      }
      if (captured.error) {
        console.warn('[Auth] Firebase OAuth redirect failed:', captured.error);
        const { getUserFriendlyError } = await import('@/lib/errorUtils');
        const msg = getUserFriendlyError(captured.error);
        if (msg !== '__SUPPRESS__') {
          sessionStorage.setItem('vybe-oauth-error', msg);
        }
      } else if (captured.session?.user) {
        try {
          const attempt = authAttempts.start(captured.session.user.id);
          const gate = await applyOAuthSession(captured.session, 'oauth', attempt);
          attempt.guard();
          if (!gate.requiresApproval && !gate.requiresEmail2fa) {
            hydrateCachedProfile(captured.session.user.id);
          }
        } catch (error) {
          if (isRetiredAuthAttempt(error)) return;
          sessionStorage.setItem('vybe-oauth-error', 'Sign-in confirmation is unavailable. Please sign in again.');
          authInitializedRef.current = true;
          setLoading(false);
          setIsInitialized(true);
          return;
        }
        authInitializedRef.current = true;
        setLoading(false);
        setIsInitialized(true);
      }

      const extracted = await extractHashTokens();
      if (extracted) {
        authInitializedRef.current = true;
        setLoading(false);
        setIsInitialized(true);
        return;
      }

      logEvent('auth', 'Initializing: checking existing session');

      const sessionReadSnapshot = tokenAccountSnapshot();
      const isSessionReadCurrent = () => mountedRef.current && tokenAccountSnapshot().uid === sessionReadSnapshot.uid && tokenAccountSnapshot().epoch === sessionReadSnapshot.epoch;
      let getSessionHandled = false;
      const handleGetSession = async (
        result: Awaited<ReturnType<typeof db.auth.getSession>>,
      ) => {
        if (getSessionHandled || !isSessionReadCurrent()) return;
        getSessionHandled = true;

        const { data: { session }, error } = result;
        // Neither a native-vault timeout nor an unresolved Firebase hydration
        // establishes signed-out state. Keep the bounded restoration surface.
        if (error?.name === 'auth/restore-pending' || error?.name === 'auth/restore-unavailable' || getAuthRestoreState() !== 'ready') {
          setLoading(false);
          return;
        }
        if (error) {
          if (hasStoredToken()) {
            logEvent('auth', 'getSession error with stored token — refreshing', { error: error.message });
            const { data: refreshed, error: refreshError } = await refreshStoredSession();
            if (!isSessionReadCurrent()) return;
            if (refreshed.session?.user) {
              logEvent('auth', 'refreshSession restored session after getSession error', { userId: refreshed.session.user.id });
              setWasLoggedIn(true);
              authInitializedRef.current = true;
              setSession(refreshed.session);
              setUser(refreshed.session.user);
              setActiveAuthUserId(refreshed.session.user.id);
              hydrateCachedProfile(refreshed.session.user.id);
              if (refreshed.session.expires_at) scheduleTokenRefresh(refreshed.session.expires_at);
              bootstrapSessionData(refreshed.session.user.id, 'TOKEN_REFRESHED');
              clearOAuthRedirectPending();
              setLoading(false);
              setIsInitialized(true);
              return;
            }
            if (!refreshError || !isFatalRefreshError(refreshError.message)) {
              logEvent('auth', 'Keeping stored token after getSession error (offline/slow network)');
              hydrateCachedProfile();
              authInitializedRef.current = true;
              setLoading(false);
              setIsInitialized(true);
              return;
            }
          }

          logEvent('auth', 'getSession error (stale token?) — starting fresh', { error: error.message });
          setSession(null);
          setUser(null);
          if (hasStoredToken() && hydrateCachedProfile()) {
            logEvent('auth', 'Keeping cached profile after getSession error');
          } else if (typeof navigator !== 'undefined' && !navigator.onLine && hasStoredToken()) {
            hydrateCachedProfile();
          } else {
            setProfile(null);
            clearProfileCache();
          }
          clearOAuthRedirectPending();
          authInitializedRef.current = true;
          setLoading(false);
          setIsInitialized(true);
          return;
        }

        // Stored token but no session yet — actively refresh instead of timing out
        // into a local sign-out (common on Despia cold start over slow networks).
        if (!session && hasStoredToken()) {
          logEvent('auth', 'getSession returned null but stored token exists — refreshing');

          const { data, error } = await refreshStoredSession();
          if (!isSessionReadCurrent()) return;

          if (data.session?.user) {
            logEvent('auth', 'refreshSession restored session', { userId: data.session.user.id });
            setWasLoggedIn(true);
            authInitializedRef.current = true;
            setSession(data.session);
            setUser(data.session.user);
            setActiveAuthUserId(data.session.user.id);
            /* hydrateCachedProfile handled by listener */
            if (data.session.expires_at) {
              scheduleTokenRefresh(data.session.expires_at);
            }
            bootstrapSessionData(data.session.user.id, 'TOKEN_REFRESHED');
            clearOAuthRedirectPending();
            setLoading(false);
            setIsInitialized(true);
            return;
          }

          if (error && isFatalRefreshError(error.message)) {
            logEvent('auth', 'Refresh token invalid — clearing local session', { error: error.message });
            const signOutSnapshot = tokenAccountSnapshot(), sdkUser = getFirebaseAuth()?.currentUser;
            const signOutLifetime = providerLifetimeRef.current;
            const guard = () => {
              if (!isSessionReadCurrent() || providerLifetimeRef.current !== signOutLifetime || getFirebaseAuth()?.currentUser !== sdkUser) throw new Error('Session recovery was replaced.');
            };
            try {
              await db.auth.signOut({ scope: 'local', guard });
            } catch { /* ignore */ }
            const after = tokenAccountSnapshot();
            if (!mountedRef.current || providerLifetimeRef.current !== signOutLifetime || getFirebaseAuth()?.currentUser || after.uid || after.epoch !== signOutSnapshot.epoch + (signOutSnapshot.uid ? 1 : 0)) return;
            setSession(null);
            setUser(null);
            setProfile(null);
            clearProfileCache();
          } else {
            logEvent('auth', 'Session refresh pending — keeping stored token (offline/slow network)');
            hydrateCachedProfile();
          }

          authInitializedRef.current = true;
          setLoading(false);
          setIsInitialized(true);
          return;
        }

        logEvent('auth', 'getSession resolved', { hasSession: !!session, userId: session?.user?.id });

        let resolvedSession = session;
        if (!resolvedSession?.user && isOAuthRedirectInFlight()) {
          const captured = await awaitOAuthRedirectCapture();
          if (!isSessionReadCurrent()) return;
          if (captured.session?.user) resolvedSession = captured.session;
        }
        if (!resolvedSession?.user) {
          const retry = await db.auth.getSession();
          if (!isSessionReadCurrent()) return;
          if (retry.data.session?.user) resolvedSession = retry.data.session;
        }

        if (!isSessionReadCurrent() || tokenAccountSnapshot().uid !== resolvedSession?.user?.id) return;
        authInitializedRef.current = true;
        setSession(resolvedSession);
        setUser(resolvedSession?.user ?? null);
        
        if (resolvedSession?.user) {
          setWasLoggedIn(true);
          setActiveAuthUserId(resolvedSession.user.id);
          hydrateCachedProfile(resolvedSession.user.id);
          if (resolvedSession.expires_at) {
            scheduleTokenRefresh(resolvedSession.expires_at);
          }
          bootstrapSessionData(resolvedSession.user.id, 'INITIAL_SESSION');
          clearOAuthRedirectPending();
        }
        
        setLoading(false);
        setIsInitialized(true);
      };

      const getSessionTimeout = window.setTimeout(() => {
        if (getSessionHandled) return;
        // Do not consume the real read or synthesize an authoritative null.
        // Its late checked result or the Auth listener may still restore it.
        if (isSessionReadCurrent()) setLoading(false);
      }, getSessionMs);

      db.auth.getSession().then((result) => {
        window.clearTimeout(getSessionTimeout);
        void handleGetSession(result);
      });
    })();
    // Cleanup on unmount
    return () => {
      mountedRef.current = false;
      providerLifetimeRef.current += 1;
      bootstrapUserRef.current = null;
      profileAttemptRef.current += 1;
      if (bootstrapRetryTimerRef.current !== null) clearTimeout(bootstrapRetryTimerRef.current);
      bootstrapRetryTimerRef.current = null;
      authAttempts.retire();
      document.removeEventListener('visibilitychange', resumeRefresh);
      window.removeEventListener('app-resumed', resumeRefresh);
      window.removeEventListener('online', resumeRefresh);
      window.removeEventListener('pageshow', onPageShow);
      window.clearTimeout(authSafetyTimeout);
      subscription.unsubscribe();
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (banSubscriptionRef.current) {
        db.removeChannel(banSubscriptionRef.current);
      }
      clearBanExpiryTimer();
    };
  }, []);

  const signUp = async (email: string, password: string, username: string) => {
    const attempt = authAttempts.start(undefined, false);
    const signupToken = Symbol('signup');
    let createdUid: string | undefined;
    let createdAccount = false;
    try {
      const normalizedEmail = normalizeLoginEmail(email);
      const cleanUsername = normalizeUsername(username);
      if (!cleanUsername || cleanUsername.length < 3) throw new Error('Username must be at least 3 characters.');
      const { checkUsernameAvailable } = await import('@/lib/usernameAvailability');
      const availability = await checkUsernameAvailable(cleanUsername);
      attempt.guard();
      if (availability.error) throw new Error(availability.error);
      if (!availability.available) throw new Error('This username is already taken. Please choose another.');
      stashSignupUsername(cleanUsername);
      pendingSignupRef.current = signupToken;
      const { data, error } = await db.auth.signUp({ email: normalizedEmail, password, options: {
        emailRedirectTo: getAuthRedirectUrl('/auth/callback'), data: { username: cleanUsername },
      } });
      if (error) throw error;
      createdAccount = Boolean(data.user || data.session?.user);
      createdUid = data.session?.user?.id;
      if (data.session?.user) {
        attempt.bindAuthenticated(data.session.user.id);
        attempt.guard();
        setProfile(null);
        setWasLoggedIn(true);
        setSession(data.session);
        setUser(data.session.user);
        setActiveAuthUserId(data.session.user.id);
        authInitializedRef.current = true;
        setLoading(false); setIsInitialized(true);
        if (data.session.expires_at) scheduleTokenRefresh(data.session.expires_at);
        bootstrapUserRef.current = `${data.session.user.id}:${reportAccountSnapshot().epoch}`;
        await fetchProfile(data.session.user.id, 0, attempt.guard, 'ensure', {
          username: cleanUsername, display_name: cleanUsername, onboarding_completed: false,
        });
        // Profile failure is a retryable signed-in state, not another Auth signup.
        return { error: null, needsEmailConfirmation: false, verificationEmailSent: data.verificationEmailSent !== false };
      }
      attempt.guard();
      return { error: null, needsEmailConfirmation: Boolean(data.user), verificationEmailSent: data.verificationEmailSent !== false };
    } catch (error) {
      if (createdAccount && isRetiredAuthAttempt(error)) return { error: null, needsEmailConfirmation: false };
      return { error: error as Error, needsEmailConfirmation: false };
    } finally {
      if (pendingSignupRef.current === signupToken) {
        pendingSignupRef.current = null;
        const currentUid = tokenAccountSnapshot().uid;
        if (currentUid && currentUid !== createdUid) bootstrapSessionData(currentUid, 'SIGNED_IN');
      }
    }
  };

  const signIn = async (emailOrUsername: string, password: string) => {
    const attempt = authAttempts.start();
    let confirmationAttempted = false;
    try {
      const { resolveLoginEmail } = await import('@/lib/loginEmail');
      attempt.guard();
      const normalized = await resolveLoginEmail(emailOrUsername);
      attempt.guard();
      clearOAuthRedirectPending();

      const { data, error } = await db.auth.signInWithPassword({
        email: normalized,
        password,
      });

      const sessionUser = data.session?.user;
      if (sessionUser) {
        attempt.bindAuthenticated(sessionUser.id);
        confirmationAttempted = true;
        const gate = await applyOAuthSession(data.session!, 'password', attempt);
        attempt.guard();
        return { error: null, ...gate };
      }

      attempt.guard();
      const { data: liveUser } = await db.auth.getUser();
      attempt.guard();
      if (liveUser.user) {
        attempt.bindAuthenticated(liveUser.user.id);
        confirmationAttempted = true;
        const gate = await applyOAuthSession({
          user: liveUser.user,
          access_token: '',
          refresh_token: '',
        }, 'password', attempt);
        attempt.guard();
        return { error: null, ...gate };
      }

      attempt.endCheck();
      if (error) throw error;
      return { error: new Error('Sign in did not complete. Please try again.') };
    } catch (error) {
      if (!attempt.isCurrent()) return { error: isRetiredAuthAttempt(error) ? error : new Error('This sign-in changed. Please try again.') };
      if (confirmationAttempted) {
        attempt.endCheck();
        return { error: error as Error };
      }
      try {
        const { data: liveUser } = await db.auth.getUser();
        attempt.guard();
        if (liveUser.user) {
          attempt.bindAuthenticated(liveUser.user.id);
          confirmationAttempted = true;
          const gate = await applyOAuthSession({
            user: liveUser.user,
            access_token: '',
            refresh_token: '',
          }, 'password', attempt);
          attempt.guard();
          return { error: null, ...gate };
        }
      } catch {
        /* ignore recovery errors */
      }
      if (attempt.isCurrent()) attempt.endCheck();
      return { error: error as Error };
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const { error } = await db.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: getAuthRedirectUrl('/auth/callback') },
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    const snapshot = tokenAccountSnapshot();
    const sdkUser = getFirebaseAuth()?.currentUser;
    const lifetime = providerLifetimeRef.current;
    const attempt = authAttempts.start(snapshot.uid, false);
    const guard = () => {
      attempt.guard();
      if (!mountedRef.current || lifetime !== providerLifetimeRef.current || getFirebaseAuth()?.currentUser !== sdkUser) throw new Error('Sign-out was replaced.');
    };
    const ownsSignedOutState = () => {
      const current = tokenAccountSnapshot();
      return mountedRef.current && lifetime === providerLifetimeRef.current && attempt.owns()
        && !getFirebaseAuth()?.currentUser && !current.uid
        && current.epoch === snapshot.epoch + (snapshot.uid ? 1 : 0);
    };
    guard();
    explicitSignOutRef.current = true;
    clearFunctionAuthHeadersCache();
    setWasLoggedIn(false);
    // 1) Flip local auth state IMMEDIATELY so the UI navigates instantly.
    setProfile(null);
    setUser(null);
    setSession(null);
    clearCachedCurrentProfile();
    clearCachedUserLevel();

    // The adapter owns durable logout and its native tombstone. Do not run a
    // second logout or wipe arbitrary auth keys after this await: a replacement
    // sign-in may already own those credentials.
    try {
      const result = await db.auth.signOut({ scope: 'local', guard });
      if (result?.error) return;
    } catch (err: unknown) {
      console.warn('[Auth] Local signOut failed (state already cleared):', err);
      return;
    }
    if (!ownsSignedOutState()) return;
    // 3) Defer all theme/DOM/localStorage cleanup so it never blocks the navigate.
    queueMicrotask(() => {
      if (!ownsSignedOutState()) return;
      try {
        const qc = (window as any).__REACT_QUERY_CLIENT__;
        if (qc && typeof qc.clear === 'function') qc.clear();

        localStorage.removeItem('vybe-font-body');
        localStorage.removeItem('vybe-font-display');
        localStorage.removeItem('vybe-anim-speed');
        localStorage.removeItem('vybe-anim-style');
        localStorage.removeItem('vybe-custom-animations');

        const customAnimStyle = document.getElementById('vybe-custom-animations');
        if (customAnimStyle) customAnimStyle.remove();

        const root = document.documentElement;
        root.style.removeProperty('--font-body');
        root.style.removeProperty('--font-display');
        root.style.fontFamily = 'system-ui, sans-serif';

        resetThemeToDefault();

        document.body.style.backgroundImage = '';
        document.body.style.removeProperty('background-image');
        document.body.style.removeProperty('background-size');
        document.body.style.removeProperty('background-position');
        document.body.style.removeProperty('background-attachment');
        document.body.style.removeProperty('background-repeat');
      } catch {}
    });
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user?.id || !profile || profile.user_id !== user.id) return { error: new Error('Load your profile before saving changes.') };
    const accountGuard = profileAccountGuard(user.id);
    const lifetime = providerLifetimeRef.current;
    const guard = () => {
      accountGuard();
      if (!mountedRef.current || lifetime !== providerLifetimeRef.current) throw Object.assign(new Error('Profile editor closed.'), { code: 'account-changed' });
    };
    const ownerEpoch = reportAccountSnapshot().epoch;
    const ownProfile = profile;
    try {
      guard();
      await updateUserProfile(user.id, updates, guard);
      guard();
      if (!mountedRef.current || profileScopeRef.current?.epoch !== ownerEpoch) throw new Error('Your account changed.');
      const confirmed = { ...ownProfile, ...updates, ...(updates.username !== undefined ? { username: normalizeUsername(String(updates.username)) } : {}) };
      setProfile(confirmed);
      persistCurrentProfile(confirmed, guard);
      const qc = (window as any).__REACT_QUERY_CLIENT__;
      for (const key of ['profile', 'profile-by-id', 'user-profile', 'profiles']) void qc?.invalidateQueries({ queryKey: [key] });
      return { error: null };
    } catch (error) { return { error: error as Error }; }
  };

  const refreshProfile = async () => {
    if (!user?.id) return null;
    return fetchProfile(user.id, 0, profileAccountGuard(user.id), 'ensure', undefined, true);
  };
  const retryProfileSetup = async () => { if (user?.id) await fetchProfile(user.id, 0, profileAccountGuard(user.id)); };
  const recoverProfileSetup = async () => {
    if (user?.id && setupState?.uid === user.id && setupState.epoch === accountSession.epoch && setupState.error?.recoveryAvailable) {
      await fetchProfile(user.id, 0, profileAccountGuard(user.id), 'recover');
    }
  };
  const currentSetup = setupState?.uid === accountSession.uid && setupState?.epoch === accountSession.epoch ? setupState : null;
  const profileSetupError = currentSetup?.error ?? null;
  const profileSetupLoading = !!user && (!currentSetup || currentSetup.loading);

  const resolvedProfile = useMemo(() => {
    if (!profile || profile.user_id !== user?.id || profile.user_id !== accountSession.uid || profileScopeRef.current?.epoch !== accountSession.epoch) return null;
    const avatar = resolveProfileAvatarUrl(profile.id, profile.avatar_url);
    if (avatar === profile.avatar_url) return profile;
    return { ...profile, avatar_url: avatar ?? profile.avatar_url };
  }, [profile, user?.id, accountSession]);

  // Stable context value: auth API functions close over fresh state via a ref,
  // so consumers only re-render when auth *data* actually changes.
  const apiRef = useRef({ signUp, signIn, applyOAuthSession, resendVerification, signOut, updateProfile, refreshProfile, retryProfileSetup, recoverProfileSetup });
  apiRef.current = { signUp, signIn, applyOAuthSession, resendVerification, signOut, updateProfile, refreshProfile, retryProfileSetup, recoverProfileSetup };
  const stableApi = useMemo(
    () => ({
      signUp: (email: string, password: string, username: string) => apiRef.current.signUp(email, password, username),
      signIn: (email: string, password: string) => apiRef.current.signIn(email, password),
      applyOAuthSession: (s: Session, method?: string, confirmation?: SignInConfirmation) => apiRef.current.applyOAuthSession(s, method, undefined, confirmation),
      resendVerification: (email: string) => apiRef.current.resendVerification(email),
      signOut: () => apiRef.current.signOut(),
      updateProfile: (updates: Partial<Profile>) => apiRef.current.updateProfile(updates),
      refreshProfile: () => apiRef.current.refreshProfile(),
      retryProfileSetup: () => apiRef.current.retryProfileSetup(),
      recoverProfileSetup: () => apiRef.current.recoverProfileSetup(),
    }),
    [],
  );

  const contextValue = useMemo(
    () => ({
      user,
      session,
      profile: resolvedProfile,
      loading,
      authReady: isInitialized && authRestoreState === 'ready',
      banInfo,
      profileSetupError, profileSetupLoading,
      ...stableApi,
    }),
    [user, session, resolvedProfile, loading, isInitialized, authRestoreState, banInfo, profileSetupError, profileSetupLoading, stableApi],
  );

  // Always keep AuthContext mounted — ban UI replaces children, never the provider.
  // (Dropping the provider caused cascade "useAuth must be used within an AuthProvider".)
  return (
    <AuthContext.Provider value={contextValue}>
      {banInfo ? (
        <Suspense fallback={<div role="status" aria-label="Loading account notice" className="min-h-[100dvh] bg-background flex items-center justify-center p-6">Loading account notice…</div>}>
        {banInfo.is_meme_ban ? (
          <MemeBanScreen reason={banInfo.reason} expiresAt={banInfo.expires_at} customGifUrl={banInfo.custom_gif_url} />
        ) : (
          <BannedScreen
            reason={banInfo.reason}
            expiresAt={banInfo.expires_at}
            isPermanent={banInfo.is_permanent}
          />
        )}
        </Suspense>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

const AUTH_OUTSIDE_PROVIDER_FALLBACK: AuthContextType = {
  user: null,
  session: null,
  profile: null,
  loading: true,
  authReady: false,
  banInfo: null,
  profileSetupError: null, profileSetupLoading: false,
  retryProfileSetup: async () => {}, recoverProfileSetup: async () => {},
  signUp: async () => ({ error: new Error('Auth not ready') }),
  signIn: async () => ({ error: new Error('Auth not ready') }),
  applyOAuthSession: async () => ({ requiresApproval: false }),
  resendVerification: async () => ({ error: new Error('Auth not ready') }),
  signOut: async () => {},
  updateProfile: async () => ({ error: new Error('Auth not ready') }),
  refreshProfile: async () => null,
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    // Fail-soft during ErrorBoundary remount / partial boot — hard throw cascaded
    // crashes on /auth?hc= and /home. Dev still gets a loud console error.
    console.error('useAuth must be used within an AuthProvider');
    return AUTH_OUTSIDE_PROVIDER_FALLBACK;
  }
  return context;
}

/** Fail-soft accessor for routes that can mount during crash recovery / partial boot. */
export function useAuthOptional(): AuthContextType | null {
  const context = useContext(AuthContext);
  return context === undefined ? null : context;
}
