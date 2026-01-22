import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { AuthPhase, AuthState, INITIAL_AUTH_STATE } from '@/lib/authState';
import { AUTH_ONLY_MODE } from '@/lib/authOnlyMode';

// Token refresh interval - refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

// Maximum time to wait for profile before continuing anyway
const PROFILE_TIMEOUT_MS = 5000;

interface Profile {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  interests?: string[] | null;
  onboarding_completed?: boolean | null;
  is_private?: boolean | null;
  display_name?: string | null;
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
  authPhase: AuthPhase; // Explicit phase for routing decisions
  profileLoading: boolean; // True while profile is still loading
  banInfo: BanInfo | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>('initializing');
  const [profileLoading, setProfileLoading] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banExpiryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const banSubscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const initRef = useRef(false);
  const authResolvedRef = useRef(false);
  const profileFetchRef = useRef<Promise<Profile | null> | null>(null);

  // Clear ban expiry timer
  const clearBanExpiryTimer = useCallback(() => {
    if (banExpiryTimerRef.current) {
      clearTimeout(banExpiryTimerRef.current);
      banExpiryTimerRef.current = null;
    }
  }, []);

  // Schedule auto-unban when ban expires
  const scheduleBanExpiry = useCallback((expiresAt: string | null, isPermanent: boolean) => {
    clearBanExpiryTimer();
    
    if (isPermanent || !expiresAt) return;
    
    const expiryTime = new Date(expiresAt).getTime();
    const now = Date.now();
    const timeUntilExpiry = expiryTime - now;
    
    if (timeUntilExpiry <= 0) {
      setBanInfo(null);
      return;
    }
    
    banExpiryTimerRef.current = setTimeout(() => {
      setBanInfo(null);
    }, timeUntilExpiry);
  }, [clearBanExpiryTimer]);

  // Check if user is banned
  const checkBanStatus = useCallback(async (profileId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_bans')
        .select('reason, expires_at, is_permanent, is_meme_ban')
        .eq('user_id', profileId)
        .or(`is_permanent.eq.true,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        setBanInfo(data);
        scheduleBanExpiry(data.expires_at, data.is_permanent);
      } else {
        setBanInfo(null);
        clearBanExpiryTimer();
      }
    } catch (err) {
      console.error('[Auth] Ban check error:', err);
    }
  }, [scheduleBanExpiry, clearBanExpiryTimer]);

  // Subscribe to realtime ban changes
  const subscribeToBanChanges = useCallback((profileId: string) => {
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
          checkBanStatus(profileId);
        }
      )
      .subscribe();

    banSubscriptionRef.current = channel;
  }, [checkBanStatus]);

  // Schedule token refresh before expiry
  const scheduleTokenRefresh = useCallback((expiresAt: number) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    const expiresAtMs = expiresAt * 1000;
    const now = Date.now();
    const refreshAt = expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
    const delay = Math.max(refreshAt - now, 1000);

    if (delay > 0 && delay < 24 * 60 * 60 * 1000) {
      refreshTimerRef.current = setTimeout(async () => {
        try {
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('[Auth] Token refresh failed:', error);
          } else if (data.session?.expires_at) {
            scheduleTokenRefresh(data.session.expires_at);
          }
        } catch (err) {
          console.error('[Auth] Token refresh error:', err);
        }
      }, delay);
    }
  }, []);

  // Generate a username from metadata (OAuth or email sign-up)
  const generateUsernameFromMetadata = useCallback(
    (metadata: Record<string, any>, odUserId: string): string => {
      const normalize = (raw: string) =>
        raw
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9_]/g, "")
          .replace(/_+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 20);

      if (typeof metadata.username === "string" && metadata.username.trim()) {
        const normalized = normalize(metadata.username);
        if (normalized.length >= 3) return normalized;
      }

      const name = metadata.full_name || metadata.name || "";
      if (name) {
        const base = normalize(String(name)).slice(0, 12);
        if (base.length >= 3) {
          const suffix = Math.random().toString(36).slice(2, 6);
          return `${base}_${suffix}`;
        }
      }

      return `user_${odUserId.slice(0, 8)}`;
    },
    []
  );

  // Fetch profile with timeout - deduplicated to prevent race conditions
  const fetchProfile = useCallback(async (userId: string, userMetadata?: Record<string, any>): Promise<Profile | null> => {
    if (profileFetchRef.current) {
      return profileFetchRef.current;
    }

    setProfileLoading(true);

    const fetchPromise = (async () => {
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => {
          console.warn('[Auth] Profile fetch timed out, continuing without profile');
          resolve(null);
        }, PROFILE_TIMEOUT_MS);
      });

      const profilePromise = (async (): Promise<Profile | null> => {
        try {
          // First try to get existing profile
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .limit(1);

          if (!error && data?.[0]) {
            let profileData = data[0];
            
            // If profile exists but has no username, auto-generate for OAuth users
            if (!profileData.username && userMetadata) {
              const autoUsername = generateUsernameFromMetadata(userMetadata, userId);
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                  username: autoUsername,
                  display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                  avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                })
                .eq('id', profileData.id);
              
              if (!updateError) {
                profileData = {
                  ...profileData,
                  username: autoUsername,
                  display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                  avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                };
              }
            }
            
            setProfile(profileData);
            checkBanStatus(profileData.id);
            subscribeToBanChanges(profileData.id);
            return profileData;
          }

          // If profile is missing, create it via ensure_profile RPC
          const { error: ensureError } = await supabase.rpc('ensure_profile');
          if (ensureError) {
            console.error('[Auth] ensure_profile failed:', ensureError);
            // Don't crash - set null profile but keep user logged in
            setProfile(null);
            return null;
          }

          // Fetch the newly created profile
          const { data: afterEnsure, error: afterEnsureError } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', userId)
            .limit(1);

          if (!afterEnsureError && afterEnsure?.[0]) {
            let profileData = afterEnsure[0];
            
            if (!profileData.username && userMetadata) {
              const autoUsername = generateUsernameFromMetadata(userMetadata, userId);
              const { error: updateError } = await supabase
                .from('profiles')
                .update({ 
                  username: autoUsername,
                  display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                  avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                })
                .eq('id', profileData.id);
              
              if (!updateError) {
                profileData = {
                  ...profileData,
                  username: autoUsername,
                  display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                  avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                };
              }
            }
            
            setProfile(profileData);
            checkBanStatus(profileData.id);
            subscribeToBanChanges(profileData.id);
            return profileData;
          }

          setProfile(null);
          return null;
        } catch (err) {
          console.error('[Auth] Profile fetch error:', err);
          // CRITICAL: Don't crash - keep user logged in even if profile fails
          setProfile(null);
          return null;
        }
      })();

      // Race between profile fetch and timeout
      const result = await Promise.race([profilePromise, timeoutPromise]);
      return result;
    })();

    profileFetchRef.current = fetchPromise;
    
    try {
      return await fetchPromise;
    } finally {
      profileFetchRef.current = null;
      setProfileLoading(false);
    }
  }, [generateUsernameFromMetadata, checkBanStatus, subscribeToBanChanges]);

  // Refresh profile (for external use)
  const refreshProfile = useCallback(async () => {
    if (AUTH_ONLY_MODE) return;
    if (user) {
      profileFetchRef.current = null;
      await fetchProfile(user.id, user.user_metadata);
    }
  }, [user, fetchProfile]);

  // Clean up all timers and subscriptions
  const cleanup = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    if (banSubscriptionRef.current) {
      supabase.removeChannel(banSubscriptionRef.current);
      banSubscriptionRef.current = null;
    }
    clearBanExpiryTimer();
  }, [clearBanExpiryTimer]);

  // Resolve auth state with explicit phase - INSTANT, no profile dependency
  const resolveAuthInstant = useCallback((newSession: Session | null) => {
    if (newSession?.user) {
      setAuthPhase('authenticated');
    } else {
      setAuthPhase('unauthenticated');
    }
    authResolvedRef.current = true;
    setLoading(false);
    setAuthReady(true);
  }, []);

  // Handle session changes - INSTANT auth resolution, profile loads in background
  const handleSessionChange = useCallback(async (newSession: Session | null) => {
    setSession(newSession);
    setUser(newSession?.user ?? null);

    if (newSession?.user) {
      if (newSession.expires_at) {
        scheduleTokenRefresh(newSession.expires_at);
      }
      
      // CRITICAL: Resolve auth IMMEDIATELY - don't wait for profile
      resolveAuthInstant(newSession);

      // AUTH-ONLY MODE: do NOT fetch/create profile or any user data.
      if (AUTH_ONLY_MODE) {
        setProfile(null);
        setBanInfo(null);
        setProfileLoading(false);
        return;
      }
      
      // Load profile in background - NEVER blocks auth resolution
      setProfileLoading(true);
      fetchProfile(newSession.user.id, newSession.user.user_metadata)
        .catch((err) => {
          console.warn('[Auth] Profile fetch failed (non-blocking):', err);
        })
        .finally(() => {
          setProfileLoading(false);
        });
    } else {
      setProfile(null);
      setBanInfo(null);
      cleanup();
      resolveAuthInstant(null);
    }
  }, [scheduleTokenRefresh, fetchProfile, cleanup, resolveAuthInstant]);

  // Initialize auth - runs exactly once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    let mounted = true;
    let subscription: { unsubscribe: () => void } | null = null;

    (async () => {
      try {
        // Set up auth state listener FIRST (per Supabase docs)
        const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
          if (!mounted) return;

          console.log('[Auth] State change:', event, !!newSession);

          if (event === 'SIGNED_OUT') {
            setSession(null);
            setUser(null);
            setProfile(null);
            setBanInfo(null);
            cleanup();

            if (!authResolvedRef.current) {
              setAuthPhase('unauthenticated');
              authResolvedRef.current = true;
              setLoading(false);
              setAuthReady(true);
            } else {
              setAuthPhase('unauthenticated');
            }
            return;
          }

          // Handle session changes - INSTANT auth, profile in background
          void (async () => {
            try {
              await handleSessionChange(newSession);
            } catch (err) {
              console.error('[Auth] handleSessionChange error (non-blocking):', err);
              // FAILSAFE: Mark auth resolved even on error - NEVER block login
              if (!authResolvedRef.current) {
                // Still mark as authenticated if we have a session
                if (newSession?.user) {
                  setAuthPhase('authenticated');
                } else {
                  setAuthPhase('unauthenticated');
                }
                authResolvedRef.current = true;
                setLoading(false);
                setAuthReady(true);
              }
            }
          })();
        });

        subscription = data.subscription;

        // THEN restore existing session from storage
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (!mounted) return;

        if (sessionError) {
          console.error('[Auth] getSession error (non-blocking):', sessionError);
          // DON'T set error phase - just mark as unauthenticated
          if (!authResolvedRef.current) {
            setAuthPhase('unauthenticated');
            authResolvedRef.current = true;
            setLoading(false);
            setAuthReady(true);
          }
          return;
        }

        if (!authResolvedRef.current) {
          await handleSessionChange(sessionData.session);
        }
      } catch (err) {
        console.error('[Auth] Init error (non-blocking):', err);
        // DON'T brick the app - just mark as unauthenticated
        if (mounted && !authResolvedRef.current) {
          setAuthPhase('unauthenticated');
          authResolvedRef.current = true;
          setLoading(false);
          setAuthReady(true);
        }
      }
    })();

    return () => {
      mounted = false;
      try {
        subscription?.unsubscribe();
      } catch {
        // ignore
      }
      cleanup();
    };
  }, [handleSessionChange, cleanup]);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            username: username.toLowerCase().replace(/\s+/g, ''),
          },
        },
      });

      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // AUTH-ONLY MODE: do NOT fetch/create profile.
      if (!AUTH_ONLY_MODE) {
        // DON'T wait for profile - just trigger background fetch
        if (data.user) {
          setProfileLoading(true);
          fetchProfile(data.user.id, data.user.user_metadata)
            .catch((err) => {
              console.warn('[Auth] Profile fetch after sign-in failed (non-blocking):', err);
            })
            .finally(() => {
              setProfileLoading(false);
            });
        }
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, [fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setBanInfo(null);
    setAuthPhase('unauthenticated');
  }, []);

  const updateProfile = useCallback(async (updates: Partial<Profile>) => {
    if (!profile) return { error: new Error('No profile') };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', profile.id);

      if (error) throw error;

      setProfile({ ...profile, ...updates });
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, [profile]);

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
      authReady,
      authPhase,
      profileLoading,
      banInfo,
      signUp,
      signIn,
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
