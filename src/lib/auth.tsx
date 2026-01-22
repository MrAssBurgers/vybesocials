import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { AuthPhase } from '@/lib/authState';
import { AUTH_ONLY_MODE } from '@/lib/authOnlyMode';

// Maximum time to wait for profile before continuing anyway
const PROFILE_TIMEOUT_MS = 4000;

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
  authPhase: AuthPhase;
  profileLoading: boolean;
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

  // Tracks whether we've successfully resolved auth at least once.
  // This avoids StrictMode double-effect edge cases causing permanent "Signing you in...".
  const resolvedRef = useRef(false);
  const profileFetchRef = useRef<Promise<Profile | null> | null>(null);
  const profileRetryRef = useRef<string | null>(null);

  // Supabase query builders are thenable, but not typed as Promise<T> in our generated types.
  // Use Promise.resolve(...) to safely treat them as promises for timeouts.
  const withTimeout = useCallback(async <T,>(promiseLike: unknown, ms: number, label: string): Promise<T> => {
    return await Promise.race([
      Promise.resolve(promiseLike as any) as Promise<T>,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  }, []);

  // Generate username from OAuth metadata
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

  // Check ban status
  const checkBanStatus = useCallback(async (profileId: string) => {
    try {
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
      } else {
        setBanInfo(null);
      }
    } catch (err) {
      console.error('[Auth] Ban check error:', err);
    }
  }, []);

  // Fetch profile with timeout - NEVER blocks auth
  const fetchProfile = useCallback(async (userId: string, userMetadata?: Record<string, any>): Promise<Profile | null> => {
    if (AUTH_ONLY_MODE) return null;
    if (profileFetchRef.current) return profileFetchRef.current;

    setProfileLoading(true);

    const fetchPromise = (async () => {
      try {
        // Try to get existing profile
        let existing: { data: any; error: any } | null = null;
        try {
          existing = await withTimeout(
            supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
            PROFILE_TIMEOUT_MS,
            'profiles.select'
          );
        } catch (e) {
          console.warn('[Auth] profiles.select failed (non-blocking):', e);
        }

        if (existing && !existing.error && existing.data) {
          const data = existing.data;
          let profileData = data;
          
          // Auto-generate username for OAuth users if missing
          if (!profileData.username && userMetadata) {
            const autoUsername = generateUsernameFromMetadata(userMetadata, userId);
            try {
              await withTimeout(
                supabase
                  .from('profiles')
                  .update({
                    username: autoUsername,
                    display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                    avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                  })
                  .eq('id', profileData.id),
                PROFILE_TIMEOUT_MS,
                'profiles.update'
              );
            } catch (e) {
              console.warn('[Auth] profiles.update failed (non-blocking):', e);
            }
            
            profileData = {
              ...profileData,
              username: autoUsername,
              display_name: userMetadata.full_name || userMetadata.name || autoUsername,
              avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
            };
          }
          
          setProfile(profileData);
          checkBanStatus(profileData.id);
          return profileData;
        }

        // Profile missing - try to create via ensure_profile
        try {
          await withTimeout(supabase.rpc('ensure_profile'), PROFILE_TIMEOUT_MS, 'ensure_profile');
        } catch (e) {
          console.warn('[Auth] ensure_profile failed:', e);
        }

        // Fetch newly created profile
        let created: { data: any; error: any } | null = null;
        try {
          created = await withTimeout(
            supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
            PROFILE_TIMEOUT_MS,
            'profiles.select.after_ensure'
          );
        } catch (e) {
          console.warn('[Auth] profiles.select(after ensure) failed (non-blocking):', e);
        }

        if (created && !created.error && created.data) {
          let profileData = created.data;
          
          if (!profileData.username && userMetadata) {
            const autoUsername = generateUsernameFromMetadata(userMetadata, userId);
            try {
              await withTimeout(
                supabase
                  .from('profiles')
                  .update({
                    username: autoUsername,
                    display_name: userMetadata.full_name || userMetadata.name || autoUsername,
                    avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
                  })
                  .eq('id', profileData.id),
                PROFILE_TIMEOUT_MS,
                'profiles.update.after_ensure'
              );
            } catch (e) {
              console.warn('[Auth] profiles.update(after ensure) failed (non-blocking):', e);
            }
            
            profileData = {
              ...profileData,
              username: autoUsername,
              display_name: userMetadata.full_name || userMetadata.name || autoUsername,
              avatar_url: profileData.avatar_url || userMetadata.avatar_url || userMetadata.picture,
            };
          }
          
          setProfile(profileData);
          checkBanStatus(profileData.id);
          return profileData;
        }

        setProfile(null);
        return null;
      } catch (err) {
        console.warn('[Auth] Profile fetch error (non-blocking):', err);
        setProfile(null);
        return null;
      }
    })();

    profileFetchRef.current = fetchPromise;
    
    try {
      return await fetchPromise;
    } finally {
      profileFetchRef.current = null;
      setProfileLoading(false);
    }
  }, [generateUsernameFromMetadata, checkBanStatus]);

  // Refresh profile
  const refreshProfile = useCallback(async () => {
    if (AUTH_ONLY_MODE || !user) return;
    profileFetchRef.current = null;
    await fetchProfile(user.id, user.user_metadata);
  }, [user, fetchProfile]);

  // If auth is valid but profile is still missing, retry once (handles transient backend hiccups)
  useEffect(() => {
    if (AUTH_ONLY_MODE) return;

    if (!user?.id) {
      profileRetryRef.current = null;
      return;
    }

    if (authPhase !== 'authenticated') return;
    if (profile || profileLoading) return;

    if (profileRetryRef.current === user.id) return;
    profileRetryRef.current = user.id;

    const t = setTimeout(() => {
      refreshProfile().catch(() => {});
    }, 1200);

    return () => clearTimeout(t);
  }, [user?.id, authPhase, profile, profileLoading, refreshProfile]);

  // CORE: Handle session changes - INSTANT auth resolution
  const handleSessionChange = useCallback((newSession: Session | null) => {
    console.log('[Auth] handleSessionChange:', !!newSession);

    resolvedRef.current = true;
    
    setSession(newSession);
    setUser(newSession?.user ?? null);

    if (newSession?.user) {
      // AUTHENTICATED - resolve IMMEDIATELY
      setAuthPhase('authenticated');
      setLoading(false);
      setAuthReady(true);

      // Fetch profile in background - NEVER blocks
      if (!AUTH_ONLY_MODE) {
        fetchProfile(newSession.user.id, newSession.user.user_metadata).catch(() => {});
      }
    } else {
      // UNAUTHENTICATED
      setProfile(null);
      setBanInfo(null);
      setAuthPhase('unauthenticated');
      setLoading(false);
      setAuthReady(true);
    }
  }, [fetchProfile]);

  // Initialize auth - runs exactly once
  useEffect(() => {
    let mounted = true;

    console.log('[Auth] Initializing...');

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      console.log('[Auth] State change:', event, !!newSession);
      handleSessionChange(newSession);
    });

    // THEN get existing session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      
      if (error) {
        console.error('[Auth] getSession error:', error);
        setAuthPhase('unauthenticated');
        setLoading(false);
        setAuthReady(true);
        return;
      }

      // Always apply the session snapshot; handleSessionChange is idempotent.
      handleSessionChange(data.session);
    });

    // Hard failsafe - NEVER stay loading forever
    const failsafe = setTimeout(() => {
      if (mounted && !resolvedRef.current) {
        console.warn('[Auth] Failsafe timeout - forcing ready');
        setAuthPhase('unauthenticated');
        setLoading(false);
        setAuthReady(true);
      }
    }, 5000);

    return () => {
      mounted = false;
      clearTimeout(failsafe);
      subscription.unsubscribe();
    };
  }, [handleSessionChange]);

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { username: username.toLowerCase().replace(/\s+/g, '') },
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
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
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
      <BannedScreen reason={banInfo.reason} expiresAt={banInfo.expires_at} isPermanent={banInfo.is_permanent} />
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
