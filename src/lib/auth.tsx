import { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback, ReactNode } from 'react';
import type { User, Session } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { updateUserProfile, getProfileByAuthUid, ensureUserProfile } from '@/lib/firebase/users';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { setCachedProfile, setCachedCurrentProfile, getCachedCurrentProfile, clearCachedCurrentProfile, clearProfileCache, setActiveAuthUserId, isRawId, stripStaleOnboardingFlagFromDisk, type CachedProfile } from '@/lib/profileCache';
import { clearCachedUserLevel } from '@/lib/userLevelCache';
import { prefetchDMConversationsFromNav } from '@/lib/loadDMConversations';
import { warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { prefetchAndApplyUserTheme } from '@/lib/themeHydration';
import { resolveSessionProfileId, resetSessionProfileMemo } from '@/lib/resolveSessionProfileId';
import { resetThemeToDefault } from '@/lib/themeReset';
import { hasStoredAuthSession, getStoredAuthUserId, clearObsoleteAuthStorage } from '@/lib/legacyAuthStorage';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';
import { clearFunctionAuthHeadersCache } from '@/lib/functionAuth';
import { logEvent } from '@/lib/debugLogger';
import {
  clearSignupUsername,
  isGeneratedUsername,
  normalizeUsername,
  stashSignupUsername,
} from '@/lib/username';
import { checkUsernameAvailable } from '@/lib/usernameAvailability';
import { startHeartbeat, stopHeartbeat } from '@/lib/analytics';
import { removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { pickActiveBan } from '@/lib/banUtils';
import { normalizeLoginEmail } from '@/lib/loginEmail';
import { cacheProfileAvatar, resolveProfileAvatarUrl } from '@/lib/profileAvatarCache';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from '@/lib/passwordRecoveryUrl';
import { awaitOAuthRedirectCapture, clearOAuthRedirectPending, isLikelyFirebaseOAuthReturnUrl, isOAuthRedirectInFlight, recoverOAuthSessionIfSignedIn } from '@/lib/firebase/oauthRedirect';
import { isDespiaOAuthInFlight } from '@/lib/despiaOAuth';
import { captureException } from '@/lib/sentry';

/** Fail-soft — production may not have deployed sync_signup_username yet. */
async function trySyncSignupUsername(): Promise<string | null> {
  try {
    const { data, error } = await db.rpc('sync_signup_username');
    if (error) return null;
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

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

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  authReady: boolean;
  banInfo: BanInfo | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  /** Apply Firebase OAuth session immediately (popup / redirect completion). */
  applyOAuthSession: (session: Session, method?: string) => void;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<Profile | null | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function cachedProfileToProfile(cached: CachedProfile, userId = ''): Profile {
  return {
    id: cached.id,
    user_id: cached.user_id || userId,
    username: cached.username,
    display_name: cached.display_name,
    avatar_url: cached.avatar_url,
    bio: cached.bio || '',
    created_at: new Date().toISOString(),
    // Only trust cached true; false/undefined requires a fresh DB fetch before redirect decisions.
    onboarding_completed: cached.onboarding_completed === true ? true : undefined,
  };
}

/** Keep disk-cached profile visible when live fetch fails — never flash to skeleton. */
function retainCachedProfile(
  setProfile: (updater: (prev: Profile | null) => Profile | null) => void,
  userId = '',
): boolean {
  const cached = getCachedCurrentProfile();
  if (!cached || isRawId(cached.username)) return false;
  if (userId && cached.user_id && cached.user_id !== userId) return false;
  setProfile((prev) => {
    const cachedProfile = cachedProfileToProfile(cached, userId);
    if (!prev) return cachedProfile;
    if (prev.user_id && userId && prev.user_id !== userId) return cachedProfile;
    if (!prev.avatar_url && cachedProfile.avatar_url) {
      return { ...prev, avatar_url: cachedProfile.avatar_url };
    }
    return prev;
  });
  return true;
}

function persistCurrentProfile(profileData: Profile) {
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
  if (profileData.user_id && profileData.id) {
    void syncUserAuthIndex(profileData.user_id, profileData.id).catch(() => {});
  }
  requestAnimationFrame(() => {
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
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === 'undefined' || !hasStoredAuthSession()) return null;
    const cached = getCachedCurrentProfile();
    if (!cached || isRawId(cached.username)) return null;
    return cachedProfileToProfile(cached);
  });
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

  // Reject stale cached profile when auth user changes (wrong-user queries break RLS).
  useEffect(() => {
    setActiveAuthUserId(user?.id ?? null);
    if (!user?.id) {
      resetSessionProfileMemo();
      return;
    }
    setProfile((prev) => {
      if (!prev) return prev;
      if (!prev.user_id) return { ...prev, user_id: user.id };
      if (prev.user_id !== user.id) return null;
      return prev;
    });
  }, [user?.id]);

  // Clear ban expiry timer
  const clearBanExpiryTimer = () => {
    if (banExpiryTimerRef.current) {
      clearTimeout(banExpiryTimerRef.current);
      banExpiryTimerRef.current = null;
    }
  };

  // Schedule auto-unban when ban expires
  const scheduleBanExpiry = (expiresAt: string | null, isPermanent: boolean) => {
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
      setBanInfo(null);
    }, timeUntilExpiry);
  };

  // Check if user is banned
  const checkBanStatus = async (profileId: string) => {
    const { data, error } = await db
      .from('user_bans')
      .select('reason, expires_at, is_permanent, is_meme_ban, custom_gif_url')
      .eq('user_id', profileId)
      .order('created_at', { ascending: false })
      .limit(10);

    const activeBan = !error ? pickActiveBan(data ?? []) : null;

    if (activeBan) {
      setBanInfo({ ...activeBan, reason: activeBan.reason || 'No reason provided' } as BanInfo);
      // Schedule auto-unban when time is up
      scheduleBanExpiry(activeBan.expires_at, activeBan.is_permanent);
    } else {
      setBanInfo(null);
      clearBanExpiryTimer();
    }
  };

  // Subscribe to realtime ban changes (single channel per profile — see realtimeChannel.ts)
  const subscribeToBanChanges = (profileId: string) => {
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
            checkBanStatus(profileId);
          },
        },
      ],
    );
  };

  // Schedule token refresh before expiry
  const scheduleTokenRefresh = (expiresAt: number) => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const expiresAtMs = expiresAt * 1000;
    const now = Date.now();
    const refreshAt = expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
    const delay = Math.max(refreshAt - now, 1000); // At least 1 second delay

    // Only schedule if token expires in the future
    if (delay > 0 && delay < 24 * 60 * 60 * 1000) { // Max 24 hours
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const { data, error } = await refreshFirebaseSession();
          if (error) {
            console.error('Token refresh failed:', error);
            if (isFatalRefreshError(error.message)) {
              // Refresh token is invalid/expired — clear session so the user
              // can sign back in and reload data (instead of being stuck with
              // a cached profile and 401s on every request).
              try {
                await db.auth.signOut({ scope: 'local' });
              } catch { /* ignore */ }
              setSession(null);
              setUser(null);
              setProfile(null);
              clearProfileCache();
            }
          } else if (data.session?.expires_at) {
            // Schedule next refresh
            scheduleTokenRefresh(data.session.expires_at);
          }
        } catch (err) {
          console.error('Token refresh error:', err);
        }
      }, delay);
    }
  };

  // Note: Referral/invite popup is now handled entirely by InvitePopup component
  // using the referral.ts utilities with localStorage persistence

  const fetchProfile = async (userId: string, retryCount = 0) => {
    const maxRetries = 1;

    const applyProfile = (profileData: Profile) => {
      setProfile(profileData);
      persistCurrentProfile(profileData);
      checkBanStatus(profileData.id);
      subscribeToBanChanges(profileData.id);
      return profileData;
    };
    
    try {
      const indexed = await getProfileByAuthUid(userId);
      if (indexed?.id) {
        return applyProfile(indexed as unknown as Profile);
      }

      // Prefer array result to avoid throwing when the row doesn't exist
      const { data, error } = await db
        .from('profiles')
        .select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, interests, language, timezone, coins_balance, onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings, referral_inviter_id')
        .eq('user_id', userId)
        .limit(1);

      if (!error && data?.[0]) {
        const profileData = data[0] as unknown as Profile;

        const { data: { user: authUser } } = await db.auth.getUser();
        const metaUsername = authUser?.user_metadata?.username;
        const shouldSyncSignupUsername =
          isGeneratedUsername(profileData.username) ||
          (typeof metaUsername === 'string' &&
            metaUsername.trim() &&
            normalizeUsername(metaUsername) !== normalizeUsername(profileData.username));

        if (shouldSyncSignupUsername) {
          void trySyncSignupUsername().then((syncedUsername) => {
            if (syncedUsername && !isGeneratedUsername(syncedUsername)) {
              setProfile((prev) =>
                prev?.id === profileData.id ? { ...prev, username: syncedUsername } : prev,
              );
            }
          });
        } else {
          clearSignupUsername();
        }

        return applyProfile(profileData);
      }

      if (retryCount < maxRetries) {
        await new Promise((r) => setTimeout(r, 250));
        return fetchProfile(userId, retryCount + 1);
      }

      // Fast local ensure — claim first so we don't orphan a duplicate placeholder.
      try {
        await db.rpc('claim_profile_by_email').catch(() => undefined);
        const claimed = await getProfileByAuthUid(userId);
        if (claimed?.id) {
          return applyProfile(claimed as unknown as Profile);
        }
        const ensured = await ensureUserProfile(userId);
        if (ensured?.id) {
          return applyProfile(ensured as unknown as Profile);
        }
      } catch (ensureErr) {
        console.warn('[Auth] ensureUserProfile failed:', ensureErr);
      }

      if (retainCachedProfile(setProfile, userId)) {
        window.setTimeout(() => {
          void fetchProfile(userId, 0);
        }, 2000);
        return getCachedCurrentProfile();
      }

      console.warn('[Auth] Profile unavailable — retrying in background');
      window.setTimeout(() => {
        void fetchProfile(userId, 0);
      }, 1500);
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const permissionDenied = /missing or insufficient permissions|permission-denied/i.test(msg);
      // Soft-log auth races (token not attached yet) — retry, don't spam as crash.
      if (permissionDenied) {
        console.warn('[Auth] fetchProfile permission race — retrying:', msg);
      } else {
        console.error('[Auth] fetchProfile error:', err);
      }
      
      if (retryCount < maxRetries) {
        await new Promise((r) => setTimeout(r, permissionDenied ? 500 : 300));
        return fetchProfile(userId, retryCount + 1);
      }
      
      retainCachedProfile(setProfile, userId);
      window.setTimeout(() => {
        void fetchProfile(userId, 0);
      }, permissionDenied ? 1500 : 2000);
      return null;
    }
  };

  /** Warm caches + profile after sign-in — never blocks navigation. */
  const bootstrapSessionData = (userId: string, authEvent: string) => {
    if (bootstrapUserRef.current === userId && authEvent !== 'SIGNED_IN') return;
    bootstrapUserRef.current = userId;

    queueMicrotask(() => {
      const qc = (window as any).__REACT_QUERY_CLIENT__;
      void prefetchAndApplyUserTheme(userId, qc);
      void fetchProfile(userId);

      void (async () => {
        try {
          const profileId = await Promise.race([
            resolveSessionProfileId(undefined),
            new Promise<string | null>((resolve) => window.setTimeout(() => resolve(null), 2000)),
          ]);
          if (profileId && qc) {
            qc.setQueryData(['session-profile-id', userId], profileId);
            warmHomeCachesForProfile(qc, userId, profileId);
          }
          if (qc && authEvent === 'SIGNED_IN') {
            void qc.invalidateQueries({ refetchType: 'active' });
          }
        } catch (err) {
          console.error('[Auth] Session bootstrap failed:', err);
        }

        // Claim before ensure so we don't create a placeholder authUid profile
        // that blocks email claim and duplicates accounts in friends/search.
        void (async () => {
          try {
            await db.rpc('claim_profile_by_email');
            resetSessionProfileMemo();
            await fetchProfile(userId, 0);
          } catch (err: unknown) {
            console.warn('[Auth] claim_profile_by_email failed:', err);
            captureException(err, { scope: 'auth:claim_profile_by_email', userId });
          }
        })();
      })();
    });
  };

  const applyOAuthSession = useCallback((oauthSession: Session, method = 'oauth') => {
    setWasLoggedIn(true);
    setSession(oauthSession);
    setUser(oauthSession.user);
    setActiveAuthUserId(oauthSession.user.id);
    authInitializedRef.current = true;
    setLoading(false);
    setIsInitialized(true);
    startHeartbeat();
    if (oauthSession.expires_at) {
      scheduleTokenRefresh(oauthSession.expires_at);
    }
    bootstrapSessionData(oauthSession.user.id, 'SIGNED_IN');
    clearOAuthRedirectPending();
    void db.auth.refreshSession().catch(() => {});
    void import('@/hooks/useSessionTracking').then(({ notifyFreshLogin }) => {
      void notifyFreshLogin(method);
    });
  }, []);

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

    // Helper: check if there's a stored auth token (session might be refreshing)
    const hasStoredToken = () => hasStoredAuthSession();

    const hydrateCachedProfile = (userId = '') => {
      stripStaleOnboardingFlagFromDisk();
      const resolvedUserId = userId || getStoredAuthUserId() || '';
      if (resolvedUserId) setActiveAuthUserId(resolvedUserId);
      const cachedProfile = getCachedCurrentProfile();
      if (!cachedProfile) return false;
      if (resolvedUserId && cachedProfile.user_id && cachedProfile.user_id !== resolvedUserId) {
        clearCachedCurrentProfile();
        return false;
      }
      setProfile((prev) => {
        if (prev?.user_id && resolvedUserId && prev.user_id !== resolvedUserId) {
          return cachedProfileToProfile(cachedProfile, resolvedUserId);
        }
        return prev ?? cachedProfileToProfile(cachedProfile, resolvedUserId);
      });
      requestAnimationFrame(() => prefetchDMConversationsFromNav());
      return true;
    };

    if (hasStoredToken()) {
      // Profile hydrate runs once auth user id is known (onAuthStateChange / getSession).
    }

    // Never block launch if getSession / refresh hangs (App Review 2.1a iPad).
    const { safetyMs, getSessionMs } = getAuthInitTimeouts();
    const authSafetyTimeout = window.setTimeout(() => {
      if (authInitializedRef.current) return;
      logEvent('auth', 'Auth init safety timeout — continuing');
      authInitializedRef.current = true;
      setLoading(false);
      setIsInitialized(true);
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
          return;
        }

        // ── KEY FIX: Never finalize "no session" from INITIAL_SESSION ──
        // INITIAL_SESSION with null session happens when the stored token
        // is expired and a background refresh is in progress. We MUST wait
        // for getSession() or TOKEN_REFRESHED to resolve instead.
        if (event === 'INITIAL_SESSION' && !session) {
          logEvent('auth', 'INITIAL_SESSION with no session — deferring to getSession');
          // Still unblock the login UI — getSession continues in background.
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

        // Identify the user in Sentry so errors carry user context.
        try {
          const { setSentryUser } = await import('@/lib/sentry');
          setSentryUser(session?.user ? { id: session.user.id, username: session.user.email ?? undefined } : null);
        } catch { /* noop */ }

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
      if (document.visibilityState !== 'visible') return;
      if (!hasStoredAuthSession()) return;

      const now = Date.now();
      const debounceMs = 2000;
      if (now - lastResumeRefreshAt < debounceMs) return;
      lastResumeRefreshAt = now;

      void db.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && session.expires_at) {
          const expiresMs = session.expires_at * 1000;
          if (expiresMs - Date.now() > 5 * 60 * 1000) return;
        }
        if (!session?.user) void refreshFirebaseSession();
      });
    };
    document.addEventListener('visibilitychange', resumeRefresh);
    window.addEventListener('app-resumed', resumeRefresh);
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
        applyOAuthSession(captured.session);
        hydrateCachedProfile(captured.session.user.id);
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

      let getSessionHandled = false;
      const handleGetSession = async (
        result: Awaited<ReturnType<typeof db.auth.getSession>>,
      ) => {
        if (getSessionHandled) return;
        getSessionHandled = true;

        const { data: { session }, error } = result;
        if (error) {
          if (hasStoredToken()) {
            logEvent('auth', 'getSession error with stored token — refreshing', { error: error.message });
            const { data: refreshed, error: refreshError } = await refreshStoredSession();
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
            try {
              await db.auth.signOut({ scope: 'local' });
            } catch { /* ignore */ }
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
          if (captured.session?.user) resolvedSession = captured.session;
        }
        if (!resolvedSession?.user) {
          const retry = await db.auth.getSession();
          if (retry.data.session?.user) resolvedSession = retry.data.session;
        }

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
        logEvent('auth', 'getSession timed out — continuing');
        void (async () => {
          if (isOAuthRedirectInFlight()) {
            const captured = await awaitOAuthRedirectCapture();
            if (captured.session?.user) {
              void handleGetSession({ data: { session: captured.session }, error: null });
              return;
            }
          }
          void handleGetSession({ data: { session: null }, error: null });
        })();
      }, getSessionMs);

      db.auth.getSession().then((result) => {
        window.clearTimeout(getSessionTimeout);
        void handleGetSession(result);
      });
    })();
    // Cleanup on unmount
    return () => {
      document.removeEventListener('visibilitychange', resumeRefresh);
      window.removeEventListener('app-resumed', resumeRefresh);
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
    try {
      const normalizedEmail = normalizeLoginEmail(email);
      const cleanUsername = normalizeUsername(username);
      if (!cleanUsername || cleanUsername.length < 3) {
        throw new Error('Username must be at least 3 characters.');
      }

      // 1. Validate username when RPC exists; fail-soft if not deployed on production yet.
      const availability = await checkUsernameAvailable(cleanUsername);
      if (availability.error) throw new Error(availability.error);
      if (!availability.available) {
        throw new Error('This username is already taken. Please choose another.');
      }

      stashSignupUsername(cleanUsername);

      // 2. Create auth user — username in metadata triggers handle_new_user.
      const { data, error } = await db.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: getAuthRedirectUrl('/auth/callback'),
          data: { username: cleanUsername },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session?.user) {
        setWasLoggedIn(true);
        setSession(data.session);
        setUser(data.session.user);
        setActiveAuthUserId(data.session.user.id);
        authInitializedRef.current = true;
        setLoading(false);
        setIsInitialized(true);
        /* hydrateCachedProfile handled by listener */
        if (data.session.expires_at) {
          scheduleTokenRefresh(data.session.expires_at);
        }
        bootstrapSessionData(data.session.user.id, 'SIGNED_IN');
        void trySyncSignupUsername();
        return { error: null, needsEmailConfirmation: false };
      }

      return {
        error: null,
        needsEmailConfirmation: Boolean(data.user),
      };
    } catch (error) {
      return { error: error as Error, needsEmailConfirmation: false };
    }
  };

  const signIn = async (emailOrUsername: string, password: string) => {
    const applySession = applyOAuthSession;

    try {
      const { resolveLoginEmail } = await import('@/lib/loginEmail');
      const normalized = await resolveLoginEmail(emailOrUsername);
      clearOAuthRedirectPending();

      const { data, error } = await db.auth.signInWithPassword({
        email: normalized,
        password,
      });

      if (data.session?.user) {
        applySession(data.session, 'password');
        return { error: null };
      }

      const { data: liveUser } = await db.auth.getUser();
      if (liveUser.user) {
        applySession({
          user: liveUser.user,
          access_token: '',
          refresh_token: '',
        }, 'password');
        return { error: null };
      }

      if (error) throw error;
      return { error: new Error('Sign in did not complete. Please try again.') };
    } catch (error) {
      try {
        const { data: liveUser } = await db.auth.getUser();
        if (liveUser.user) {
          applySession({
            user: liveUser.user,
            access_token: '',
            refresh_token: '',
          }, 'password');
          return { error: null };
        }
      } catch {
        /* ignore recovery errors */
      }
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
    explicitSignOutRef.current = true;
    clearFunctionAuthHeadersCache();
    setWasLoggedIn(false);
    // 1) Flip local auth state IMMEDIATELY so the UI navigates instantly.
    setProfile(null);
    setUser(null);
    setSession(null);
    clearCachedCurrentProfile();
    clearCachedUserLevel();

    // 2) Clear Firebase persistence BEFORE refresh can resurrect the session.
    //    (local-scope used to be a no-op and left firebase:authUser:* on disk.)
    try {
      await db.auth.signOut({ scope: 'local' as any });
    } catch (err: unknown) {
      console.warn('[Auth] Local signOut failed (state already cleared):', err);
    }
    // Eager disk wipe — belt and suspenders if Auth persistence lags.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('firebase:authUser:') || key.startsWith('sb-')) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      /* ignore */
    }
    void db.auth.signOut().catch((err: unknown) => {
      console.warn('[Auth] Global signOut (token revoke) failed:', err);
      captureException(err, { scope: 'auth:signOut:global' });
    });

    // #region agent log
    fetch('http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'bd2545'},body:JSON.stringify({sessionId:'bd2545',runId:'ios-post-fix',hypothesisId:'E',location:'auth.tsx:signOut',message:'signOut cleared',data:{hasFirebaseUserKey:Object.keys(localStorage).some(k=>k.startsWith('firebase:authUser:')),wasLoggedInFlag:false},timestamp:Date.now()})}).catch(()=>{});
    try {
      fetch('https://us-central1-vybe-daaab.cloudfunctions.net/authQr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({data:{action:'debug_oauth',event:'signout_cleared',hypothesisId:'E',location:'auth.tsx',payload:{runId:'ios-post-fix',hasFirebaseUserKey:Object.keys(localStorage).some(k=>k.startsWith('firebase:authUser:'))}}}),keepalive:true}).catch(()=>{});
    } catch { /* ignore */ }
    // #endregion

    // 3) Defer all theme/DOM/localStorage cleanup so it never blocks the navigate.
    queueMicrotask(() => {
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
    if (!profile) return { error: new Error('No profile') };

    // Optimistic update — flip local state immediately so UI feels instant.
    const previousProfile = profile;
    const normalizedUpdates = { ...updates };
    if (updates.username !== undefined) {
      normalizedUpdates.username = normalizeUsername(String(updates.username));
    }
    const merged = { ...profile, ...normalizedUpdates };
    setProfile(merged);

    // Update profile cache + invalidate queries optimistically too.
    void (async () => {
      try {
        persistCurrentProfile(merged);
      } catch {}
      try {
        const qc = (window as any).__REACT_QUERY_CLIENT__;
        if (qc) {
          qc.invalidateQueries({ queryKey: ['profile'] });
          qc.invalidateQueries({ queryKey: ['profile-by-id'] });
          qc.invalidateQueries({ queryKey: ['user-profile'] });
          qc.invalidateQueries({ queryKey: ['profiles'] });
        }
      } catch {}
    })();

    try {
      const authUserId = user?.id ?? profile.user_id ?? profile.id;
      await updateUserProfile(authUserId, updates as Partial<import('@/lib/firebase/types').UserProfile>);
      return { error: null };
    } catch (error) {
      // Roll back on failure
      setProfile(previousProfile);
      return { error: error as Error };
    }
  };

  const refreshProfile = async () => {
    const uid = user?.id ?? (await db.auth.getSession()).data.session?.user?.id;
    if (!uid) return null;
    const result = await Promise.race([
      fetchProfile(uid),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 5000)),
    ]);
    return result as Profile | null;
  };

  const resolvedProfile = useMemo(() => {
    if (!profile) return null;
    const avatar = resolveProfileAvatarUrl(profile.id, profile.avatar_url);
    if (avatar === profile.avatar_url) return profile;
    return { ...profile, avatar_url: avatar ?? profile.avatar_url };
  }, [profile]);

  // Stable context value: auth API functions close over fresh state via a ref,
  // so consumers only re-render when auth *data* actually changes.
  const apiRef = useRef({ signUp, signIn, applyOAuthSession, resendVerification, signOut, updateProfile, refreshProfile });
  apiRef.current = { signUp, signIn, applyOAuthSession, resendVerification, signOut, updateProfile, refreshProfile };
  const stableApi = useMemo(
    () => ({
      signUp: (email: string, password: string, username: string) => apiRef.current.signUp(email, password, username),
      signIn: (email: string, password: string) => apiRef.current.signIn(email, password),
      applyOAuthSession: (s: Session, method?: string) => apiRef.current.applyOAuthSession(s, method),
      resendVerification: (email: string) => apiRef.current.resendVerification(email),
      signOut: () => apiRef.current.signOut(),
      updateProfile: (updates: Partial<Profile>) => apiRef.current.updateProfile(updates),
      refreshProfile: () => apiRef.current.refreshProfile(),
    }),
    [],
  );

  const contextValue = useMemo(
    () => ({
      user,
      session,
      profile: resolvedProfile,
      loading,
      authReady: isInitialized,
      banInfo,
      ...stableApi,
    }),
    [user, session, resolvedProfile, loading, isInitialized, banInfo, stableApi],
  );

  // Always keep AuthContext mounted — ban UI replaces children, never the provider.
  // (Dropping the provider caused cascade "useAuth must be used within an AuthProvider".)
  return (
    <AuthContext.Provider value={contextValue}>
      {banInfo ? (
        banInfo.is_meme_ban ? (
          <MemeBanScreen reason={banInfo.reason} expiresAt={banInfo.expires_at} customGifUrl={banInfo.custom_gif_url} />
        ) : (
          <BannedScreen
            reason={banInfo.reason}
            expiresAt={banInfo.expires_at}
            isPermanent={banInfo.is_permanent}
          />
        )
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
  signUp: async () => ({ error: new Error('Auth not ready') }),
  signIn: async () => ({ error: new Error('Auth not ready') }),
  applyOAuthSession: () => {},
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
