import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { setCachedProfile, setCachedCurrentProfile, getCachedCurrentProfile, clearCachedCurrentProfile, clearProfileCache, setActiveAuthUserId, isRawId, stripStaleOnboardingFlagFromDisk, type CachedProfile } from '@/lib/profileCache';
import { clearCachedUserLevel } from '@/lib/userLevelCache';
import { prefetchDMConversationsFromNav } from '@/lib/loadDMConversations';
import { warmHomeCachesForProfile } from '@/lib/warmHomeCaches';
import { resolveSessionProfileId, resetSessionProfileMemo } from '@/lib/resolveSessionProfileId';
import { resetThemeToDefault } from '@/lib/themeReset';
import { hasStoredSupabaseSession, getStoredAuthUserId } from '@/lib/supabaseStorageKey';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { isLovablePreviewHost } from '@/lib/lovablePreview';
import { refreshSupabaseSession } from '@/lib/supabaseAuthRefresh';
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
import { normalizeLoginEmail } from '@/lib/loginEmail';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from '@/lib/passwordRecoveryUrl';

/** Fail-soft — production may not have deployed sync_signup_username yet. */
async function trySyncSignupUsername(): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc('sync_signup_username');
    if (error) return null;
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

// Token refresh interval - refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

function getStoredSessionRefreshTimeoutMs(): number {
  if (isLovablePreviewHost()) return 12000;
  return isDespiaRuntime() ? 15000 : 8000;
}

function getAuthInitTimeouts() {
  if (isLovablePreviewHost()) {
    return { safetyMs: 8000, getSessionMs: 5000 };
  }
  return { safetyMs: 3500, getSessionMs: 2500 };
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
  return refreshSupabaseSession(timeoutMs);
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
    if (prev?.user_id && userId && prev.user_id !== userId) return cachedProfileToProfile(cached, userId);
    return prev ?? cachedProfileToProfile(cached, userId);
  });
  return true;
}

function persistCurrentProfile(profileData: Profile) {
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
    prefetchDMConversationsFromNav();
    const qc = (window as any).__REACT_QUERY_CLIENT__;
    if (qc && profileData.id && profileData.user_id) {
      warmHomeCachesForProfile(qc, profileData.user_id, profileData.id, profileData as unknown as Record<string, unknown>);
    }
  });
}

/** Wait until Supabase has a session (post-signup / OAuth race). */
export async function waitForAuthSession(timeoutMs = 8000): Promise<Session | null> {
  const initial = (await supabase.auth.getSession()).data.session;
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
      const { data: { session } } = await supabase.auth.getSession();
      finish(session);
    }, timeoutMs);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && event !== 'INITIAL_SESSION') {
        finish(session);
      }
    });
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === 'undefined' || !hasStoredSupabaseSession()) return null;
    const cached = getCachedCurrentProfile();
    if (!cached || isRawId(cached.username)) return null;
    return cachedProfileToProfile(cached);
  });
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banExpiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Prevent double-triggering from onAuthStateChange + getSession running simultaneously
  const authInitializedRef = useRef(false);
  const explicitSignOutRef = useRef(false);

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
    const { data, error } = await supabase
      .from('user_bans')
      .select('reason, expires_at, is_permanent, is_meme_ban, custom_gif_url')
      .eq('user_id', profileId)
      .or(`is_permanent.eq.true,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setBanInfo(data);
      // Schedule auto-unban when time is up
      scheduleBanExpiry(data.expires_at, data.is_permanent);
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
          const { data, error } = await refreshSupabaseSession();
          if (error) {
            console.error('Token refresh failed:', error);
            if (isFatalRefreshError(error.message)) {
              // Refresh token is invalid/expired — clear session so the user
              // can sign back in and reload data (instead of being stuck with
              // a cached profile and 401s on every request).
              try {
                await supabase.auth.signOut({ scope: 'local' });
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
    const maxRetries = 2;
    
    try {
      // Prefer array result to avoid throwing when the row doesn't exist
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, interests, language, timezone, coins_balance, onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings, referral_inviter_id')
        .eq('user_id', userId)
        .limit(1);

      if (!error && data?.[0]) {
        const profileData = data[0] as unknown as Profile;

        if (isGeneratedUsername(profileData.username)) {
          const syncedUsername = await trySyncSignupUsername();
          if (syncedUsername && !isGeneratedUsername(syncedUsername)) {
            profileData.username = syncedUsername;
            clearSignupUsername();
          }
        } else {
          clearSignupUsername();
        }

        setProfile(profileData);
        persistCurrentProfile(profileData);
        // Check ban status and subscribe to realtime changes
        checkBanStatus(profileData.id);
        subscribeToBanChanges(profileData.id);
        return profileData;
      }

      // Profile may still be creating via DB trigger — wait before fallback RPC.
      if (retryCount < maxRetries) {
        console.log(`[Auth] Profile not found, waiting for trigger (${retryCount + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 400 * (retryCount + 1)));
        return fetchProfile(userId, retryCount + 1);
      }

      console.log('[Auth] Profile not found, calling ensure_profile...');
      let { error: ensureError } = await supabase.rpc('ensure_profile');
      if (ensureError) {
        console.log('[Auth] ensure_profile failed, trying claim_profile_by_email...', ensureError.message);
        ({ error: ensureError } = await supabase.rpc('claim_profile_by_email'));
      }

      if (ensureError) {
        console.error('[Auth] Profile ensure failed:', ensureError);
        
        // Retry on failure
        if (retryCount < maxRetries) {
          console.log(`[Auth] Retrying fetchProfile (${retryCount + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
          return fetchProfile(userId, retryCount + 1);
        }
        
        // Last resort — never cache or persist placeholder usernames.
        const cached = getCachedCurrentProfile();
        if (cached && !isRawId(cached.username)) {
          setProfile((prev) => prev ?? cachedProfileToProfile(cached, userId));
          window.setTimeout(() => {
            void fetchProfile(userId, 0);
          }, 2000);
          return cached;
        }

        console.warn('[Auth] Profile unavailable — retrying in background');
        window.setTimeout(() => {
          void fetchProfile(userId, 0);
        }, 1500);
        return null;
      }

      // Fetch the newly created profile
      const { data: afterEnsure, error: afterEnsureError } = await supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, interests, language, timezone, coins_balance, onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings, referral_inviter_id')
        .eq('user_id', userId)
        .limit(1);

      if (!afterEnsureError && afterEnsure?.[0]) {
        const profileData = afterEnsure[0] as unknown as Profile;

        if (isGeneratedUsername(profileData.username)) {
          const syncedUsername = await trySyncSignupUsername();
          if (syncedUsername && !isGeneratedUsername(syncedUsername)) {
            profileData.username = syncedUsername;
            clearSignupUsername();
          }
        } else {
          clearSignupUsername();
        }

        setProfile(profileData);
        persistCurrentProfile(profileData);
        // Check ban status and subscribe to realtime changes
        checkBanStatus(profileData.id);
        subscribeToBanChanges(profileData.id);
        return profileData;
      }

      console.error('[Auth] Could not fetch profile after ensure_profile');
      retainCachedProfile(setProfile, userId);
      window.setTimeout(() => {
        void fetchProfile(userId, 0);
      }, 2000);
      return null;
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err);
      
      // Retry on exception
      if (retryCount < maxRetries) {
        console.log(`[Auth] Retrying fetchProfile after exception (${retryCount + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
        return fetchProfile(userId, retryCount + 1);
      }
      
      retainCachedProfile(setProfile, userId);
      window.setTimeout(() => {
        void fetchProfile(userId, 0);
      }, 2000);
      return null;
    }
  };

  /** Resolve profile id, warm caches, and refetch active queries after sign-in. */
  const bootstrapSessionData = (userId: string, authEvent: string) => {
    // Supabase recommends deferring DB calls out of onAuthStateChange call stack.
    setTimeout(() => {
      void (async () => {
        const qc = (window as any).__REACT_QUERY_CLIENT__;
        const isFreshSignIn = authEvent === 'SIGNED_IN';

        try {
          const profileId = await resolveSessionProfileId(undefined);
          if (profileId && qc) {
            qc.setQueryData(['session-profile-id', userId], profileId);
            warmHomeCachesForProfile(qc, userId, profileId);
          }

          await fetchProfile(userId);

          if (qc && isFreshSignIn) {
            void qc.invalidateQueries({ refetchType: 'active' });
          }
        } catch (err) {
          console.error('[Auth] Session bootstrap failed:', err);
          void fetchProfile(userId);
        }
      })();
    }, 0);
  };

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
          
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });

          if (error) {
            logEvent('auth', 'setSession from hash failed', { error: error.message });
            console.error('[Auth] Failed to set session from hash tokens:', error);
            return false;
          }

          logEvent('auth', 'Session set from hash tokens successfully');
          sessionStorage.removeItem('vybe-oauth-pending');
          return true;
        }
      } catch (err) {
        console.error('[Auth] Hash token extraction error:', err);
      }
      return false;
    };

    // Helper: check if there's a stored auth token (session might be refreshing)
    const hasStoredToken = () => hasStoredSupabaseSession();

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
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
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
        }

        // ── KEY FIX: Never finalize "no session" from INITIAL_SESSION ──
        // INITIAL_SESSION with null session happens when the stored token
        // is expired and a background refresh is in progress. We MUST wait
        // for getSession() or TOKEN_REFRESHED to resolve instead.
        if (event === 'INITIAL_SESSION' && !session) {
          logEvent('auth', 'INITIAL_SESSION with no session — deferring to getSession');
          return;
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
            supabase.realtime.setAuth(session.access_token);
          }
        } catch { /* noop */ }

        if (session?.user) {
          setWasLoggedIn(true);
          setActiveAuthUserId(session.user.id);
          logEvent('auth', 'Session active, fetching profile', { userId: session.user.id });
          startHeartbeat();
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }

          hydrateCachedProfile(session.user.id);
          bootstrapSessionData(session.user.id, event);

          sessionStorage.removeItem('vybe-oauth-pending');
        } else if (event === 'SIGNED_OUT') {
          if (!explicitSignOutRef.current && hasStoredSupabaseSession()) {
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
            supabase.removeChannel(banSubscriptionRef.current);
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
      if (!hasStoredSupabaseSession()) return;

      const now = Date.now();
      const debounceMs = isLovablePreviewHost() ? 5000 : 2000;
      if (now - lastResumeRefreshAt < debounceMs) return;
      lastResumeRefreshAt = now;

      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user && session.expires_at) {
          const expiresMs = session.expires_at * 1000;
          if (expiresMs - Date.now() > 5 * 60 * 1000) return;
        }
        if (!session?.user) void refreshSupabaseSession();
      });
    };
    document.addEventListener('visibilitychange', resumeRefresh);
    window.addEventListener('app-resumed', resumeRefresh);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resumeRefresh();
    };
    window.addEventListener('pageshow', onPageShow);

    // Try to extract hash tokens first (redirect OAuth flow on mobile/tablet).
    // If successful, onAuthStateChange will fire with the session.
    // If not, fall through to normal getSession() flow.
    extractHashTokens().then((extracted) => {
      if (extracted) {
        authInitializedRef.current = true;
        setLoading(false);
        setIsInitialized(true);
        return;
      }

      logEvent('auth', 'Initializing: checking existing session');

      let getSessionHandled = false;
      const handleGetSession = async (
        result: Awaited<ReturnType<typeof supabase.auth.getSession>>,
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
              sessionStorage.removeItem('vybe-oauth-pending');
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
          sessionStorage.removeItem('vybe-oauth-pending');
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
            hydrateCachedProfile(data.session.user.id);
            if (data.session.expires_at) {
              scheduleTokenRefresh(data.session.expires_at);
            }
            bootstrapSessionData(data.session.user.id, 'TOKEN_REFRESHED');
            sessionStorage.removeItem('vybe-oauth-pending');
            setLoading(false);
            setIsInitialized(true);
            return;
          }

          if (error && isFatalRefreshError(error.message)) {
            logEvent('auth', 'Refresh token invalid — clearing local session', { error: error.message });
            try {
              await supabase.auth.signOut({ scope: 'local' });
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
        authInitializedRef.current = true;
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setWasLoggedIn(true);
          setActiveAuthUserId(session.user.id);
          hydrateCachedProfile(session.user.id);
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          bootstrapSessionData(session.user.id, 'INITIAL_SESSION');
          sessionStorage.removeItem('vybe-oauth-pending');
        }
        
        setLoading(false);
        setIsInitialized(true);
      };

      const getSessionTimeout = window.setTimeout(() => {
        if (getSessionHandled) return;
        logEvent('auth', 'getSession timed out — continuing');
        void handleGetSession({ data: { session: null }, error: null });
      }, getSessionMs);

      supabase.auth.getSession().then((result) => {
        window.clearTimeout(getSessionTimeout);
        void handleGetSession(result);
      });
    });
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
        supabase.removeChannel(banSubscriptionRef.current);
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
      const { data, error } = await supabase.auth.signUp({
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
        await trySyncSignupUsername();
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

  const signIn = async (email: string, password: string) => {
    try {
      const normalized = normalizeLoginEmail(email);
      const { error } = await supabase.auth.signInWithPassword({
        email: normalized,
        password,
      });

      // #region agent log
      fetch('http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d7bed4'},body:JSON.stringify({sessionId:'d7bed4',location:'auth.tsx:signIn',message:'signInWithPassword result',data:{ok:!error,errorCode:(error as {code?:string})?.code??null,errorMsg:error?.message??null},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const resendVerification = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
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

    // 2) Clear local Supabase session synchronously (no network round-trip).
    //    The global revoke happens in the background.
    void supabase.auth.signOut({ scope: 'local' as any }).catch(() => {});
    void supabase.auth.signOut().catch(() => {}); // background full revoke

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
    const merged = { ...profile, ...updates };
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
      const { error } = await supabase
        .from('profiles')
        .update(updates as never)
        .eq('id', profile.id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      // Roll back on failure
      setProfile(previousProfile);
      return { error: error as Error };
    }
  };

  const refreshProfile = async () => {
    const uid = user?.id ?? (await supabase.auth.getSession()).data.session?.user?.id;
    if (!uid) return null;
    return (await fetchProfile(uid)) as Profile | null;
  };

  // Show banned screen if user is banned
  if (banInfo) {
    return banInfo.is_meme_ban ? (
      <MemeBanScreen reason={banInfo.reason} expiresAt={banInfo.expires_at} customGifUrl={banInfo.custom_gif_url} />
    ) : (
      <BannedScreen
        reason={banInfo.reason}
        expiresAt={banInfo.expires_at}
        isPermanent={banInfo.is_permanent}
      />
    );
  }

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      loading,
      authReady: isInitialized,
      banInfo,
      signUp,
      signIn,
      resendVerification,
      signOut,
      updateProfile,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
