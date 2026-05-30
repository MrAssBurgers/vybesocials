import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { setCachedProfile, setCachedCurrentProfile, getCachedCurrentProfile, clearCachedCurrentProfile, clearProfileCache } from '@/lib/profileCache';
import { resetThemeToDefault } from '@/lib/themeReset';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { logEvent } from '@/lib/debugLogger';
import {
  clearSignupUsername,
  isGeneratedUsername,
  normalizeUsername,
  stashSignupUsername,
} from '@/lib/username';
import { startHeartbeat, stopHeartbeat } from '@/lib/analytics';

// Token refresh interval - refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

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
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  resendVerification: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banExpiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Prevent double-triggering from onAuthStateChange + getSession running simultaneously
  const authInitializedRef = useRef(false);

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

  // Subscribe to realtime ban changes
  const subscribeToBanChanges = (profileId: string) => {
    // Clean up existing subscription
    if (banSubscriptionRef.current) {
      supabase.removeChannel(banSubscriptionRef.current);
      banSubscriptionRef.current = null;
    }

    const channel = supabase
      .channel(`ban-status-${profileId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_bans',
          filter: `user_id=eq.${profileId}`,
        },
        () => {
          // Re-check ban status on any change (INSERT, UPDATE, DELETE)
          checkBanStatus(profileId);
        }
      )
      .subscribe();

    banSubscriptionRef.current = channel;
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
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('Token refresh failed:', error);
            // Don't logout on refresh failure - let Supabase handle it
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
          const { data: syncedUsername } = await (supabase as any).rpc('sync_signup_username');
          if (typeof syncedUsername === 'string' && syncedUsername && !isGeneratedUsername(syncedUsername)) {
            profileData.username = syncedUsername;
            clearSignupUsername();
          }
        } else {
          clearSignupUsername();
        }

        setProfile(profileData);
        // Cache profile for instant lookups elsewhere
        setCachedProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
          bio: profileData.bio,
        });
        setCachedCurrentProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
          bio: profileData.bio,
        });
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

      console.log('[Auth] Profile not found, calling claim_profile_by_email...');
      const { data: profileId, error: ensureError } = await supabase.rpc('claim_profile_by_email');
      
      if (ensureError) {
        console.error('[Auth] ensure_profile failed:', ensureError);
        
        // Retry on failure
        if (retryCount < maxRetries) {
          console.log(`[Auth] Retrying fetchProfile (${retryCount + 1}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
          return fetchProfile(userId, retryCount + 1);
        }
        
        // Create fallback profile state (don't block app)
        const fallbackProfile = {
          id: userId,
          user_id: userId,
          username: 'user_' + userId.substring(0, 8),
          avatar_url: null,
          bio: '',
          created_at: new Date().toISOString(),
          onboarding_completed: false,
        };
        setProfile(fallbackProfile as any);
        setCachedCurrentProfile(fallbackProfile as any);
        console.warn('[Auth] Using fallback profile, app may have limited functionality');
        return fallbackProfile;
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
          const { data: syncedUsername } = await (supabase as any).rpc('sync_signup_username');
          if (typeof syncedUsername === 'string' && syncedUsername && !isGeneratedUsername(syncedUsername)) {
            profileData.username = syncedUsername;
            clearSignupUsername();
          }
        } else {
          clearSignupUsername();
        }

        setProfile(profileData);
        // Cache profile for instant lookups elsewhere
        setCachedProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
          bio: profileData.bio,
        });
        setCachedCurrentProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
          bio: profileData.bio,
        });
        // Check ban status and subscribe to realtime changes
        checkBanStatus(profileData.id);
        subscribeToBanChanges(profileData.id);
        return profileData;
      }

      console.error('[Auth] Could not fetch profile after ensure_profile');
      setProfile(null);
      return null;
    } catch (err) {
      console.error('[Auth] fetchProfile error:', err);
      
      // Retry on exception
      if (retryCount < maxRetries) {
        console.log(`[Auth] Retrying fetchProfile after exception (${retryCount + 1}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 500 * (retryCount + 1)));
        return fetchProfile(userId, retryCount + 1);
      }
      
      setProfile(null);
      return null;
    }
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
      if (!hash || !hash.includes('access_token')) return false;

      try {
        const params = new URLSearchParams(hash.substring(1));
        const access_token = params.get('access_token');
        const refresh_token = params.get('refresh_token');

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

    const hydrateCachedProfile = () => {
      const cachedProfile = getCachedCurrentProfile();
      if (!cachedProfile) return false;
      setProfile((prev) => prev ?? ({
        id: cachedProfile.id,
        user_id: '',
        username: cachedProfile.username,
        display_name: cachedProfile.display_name,
        avatar_url: cachedProfile.avatar_url,
        bio: cachedProfile.bio || '',
        created_at: new Date().toISOString(),
      } as Profile));
      return true;
    };

    if (hasStoredToken()) {
      hydrateCachedProfile();
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logEvent('auth', `onAuthStateChange: ${event}`, { hasSession: !!session });
        
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
          logEvent('auth', 'Session active, fetching profile', { userId: session.user.id });
          startHeartbeat();
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);

          sessionStorage.removeItem('vybe-oauth-pending');
        } else if (event === 'SIGNED_OUT') {
          // Only clear state on explicit sign-out, not on ambiguous events
          logEvent('auth', 'Explicit sign out — clearing state');
          setProfile(null);
          clearCachedCurrentProfile();
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

    // Try to extract hash tokens first (redirect OAuth flow on mobile/tablet).
    // If successful, onAuthStateChange will fire with the session.
    // If not, fall through to normal getSession() flow.
    extractHashTokens().then((extracted) => {
      if (extracted) {
        authInitializedRef.current = true;
        return;
      }

      logEvent('auth', 'Initializing: checking existing session');
      supabase.auth.getSession().then(async ({ data: { session }, error }) => {
        if (error) {
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

        // ── KEY FIX: If getSession returns null but we have a stored token,
        // a background refresh is likely in progress. Wait for it. ──
        if (!session && hasStoredToken()) {
          logEvent('auth', 'getSession returned null but stored token exists — waiting for refresh');
          
          // Give the token refresh up to 5 seconds to complete
          // onAuthStateChange will fire TOKEN_REFRESHED and set everything
          const waitForRefresh = new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              logEvent('auth', 'Token refresh wait timed out — no session');
              resolve();
            }, 5000);
            
            // If onAuthStateChange already set the user, we're done
            const checkInterval = setInterval(() => {
              if (authInitializedRef.current) {
                clearTimeout(timeout);
                clearInterval(checkInterval);
                resolve();
              }
            }, 100);
          });
          
          await waitForRefresh;
          
          // If still not initialized after waiting, finalize as no session
          if (!authInitializedRef.current) {
            logEvent('auth', 'No session after refresh wait — finalizing as signed out');
            setSession(null);
            setUser(null);
            if (hasStoredToken() && hydrateCachedProfile()) {
              logEvent('auth', 'Keeping cached profile after refresh timeout');
            } else if (typeof navigator !== 'undefined' && !navigator.onLine && hasStoredToken()) {
              hydrateCachedProfile();
            } else {
              setProfile(null);
              clearProfileCache();
            }
            authInitializedRef.current = true;
            setLoading(false);
            setIsInitialized(true);
          }
          return;
        }

        logEvent('auth', 'getSession resolved', { hasSession: !!session, userId: session?.user?.id });
        authInitializedRef.current = true;
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          fetchProfile(session.user.id);
          sessionStorage.removeItem('vybe-oauth-pending');
        }
        
        setLoading(false);
        setIsInitialized(true);
      });
    });
    // Cleanup on unmount
    return () => {
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
      const cleanUsername = normalizeUsername(username);
      if (!cleanUsername || cleanUsername.length < 3) {
        throw new Error('Username must be at least 3 characters.');
      }

      // 1. Validate username availability BEFORE creating auth user
      const { data: isAvailable, error: checkError } = await supabase
        .rpc('is_username_available', { p_username: cleanUsername });

      if (checkError) throw new Error('Unable to verify username. Please try again.');
      if (!isAvailable) throw new Error('This username is already taken. Please choose another.');

      stashSignupUsername(cleanUsername);

      // 2. Create auth user — username in metadata triggers handle_new_user.
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: cleanUsername },
        },
      });

      if (error) throw error;

      if (data.session?.user) {
        await (supabase as any).rpc('sync_signup_username');
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

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
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    // 1) Flip local auth state IMMEDIATELY so the UI navigates instantly.
    setProfile(null);
    setUser(null);
    setSession(null);
    clearCachedCurrentProfile();

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
        const { setCachedProfile } = await import('@/lib/profileCache');
        setCachedProfile({
          id: merged.id,
          username: merged.username,
          display_name: (merged as any).display_name ?? null,
          avatar_url: merged.avatar_url ?? null,
          bio: (merged as any).bio,
        });
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
        .update(updates as Record<string, unknown>)
        .eq('id', profile.id);

      if (error) throw error;
      return { error: null };
    } catch (error) {
      // Roll back on failure
      setProfile(previousProfile);
      return { error: error as Error };
    }
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
