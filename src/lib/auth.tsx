import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { AuthPhase } from '@/lib/authState';
import { AUTH_ONLY_MODE } from '@/lib/authOnlyMode';

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

// Generate temp username
function generateTempUsername(userId: string): string {
  return `user${userId.replace(/-/g, '').slice(0, 8)}`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [authPhase, setAuthPhase] = useState<AuthPhase>('initializing');
  const [profileLoading, setProfileLoading] = useState(false);
  const [banInfo, setBanInfo] = useState<BanInfo | null>(null);

  const resolvedRef = useRef(false);
  const profileFetchRef = useRef<string | null>(null);

  // Check ban status (background, never blocks)
  const checkBanStatus = useCallback(async (profileId: string) => {
    try {
      const { data } = await supabase
        .from('user_bans')
        .select('reason, expires_at, is_permanent, is_meme_ban, custom_gif_url')
        .eq('user_id', profileId)
        .or(`is_permanent.eq.true,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setBanInfo(data || null);
    } catch {
      // Ignore - ban check is non-critical
    }
  }, []);

  // CORE: Fetch or create profile - NEVER blocks auth, NEVER logs out
  const fetchOrCreateProfile = useCallback(async (authUser: User): Promise<Profile | null> => {
    if (AUTH_ONLY_MODE) return null;
    
    const userId = authUser.id;
    
    // Prevent duplicate fetches for same user
    if (profileFetchRef.current === userId) return profile;
    profileFetchRef.current = userId;
    
    setProfileLoading(true);
    console.log('[Auth] fetchOrCreateProfile for:', userId);

    try {
      // Step 1: Try to get existing profile
      const { data: existing, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        console.log('[Auth] Profile found:', existing.id);
        setProfile(existing);
        checkBanStatus(existing.id);
        return existing;
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        console.warn('[Auth] Profile fetch error:', fetchError);
      }

      // Step 2: No profile - create one immediately
      console.log('[Auth] No profile, creating...');
      
      const metadata = authUser.user_metadata || {};
      const tempUsername = generateTempUsername(userId);
      const displayName = metadata.full_name || metadata.name || tempUsername;
      const avatarUrl = metadata.avatar_url || metadata.picture || null;

      // Use ensure_profile RPC (handles race conditions)
      try {
        await supabase.rpc('ensure_profile');
      } catch (e) {
        console.warn('[Auth] ensure_profile RPC failed, trying direct insert:', e);
        
        // Fallback: direct insert
        await supabase.from('profiles').upsert({
          user_id: userId,
          username: tempUsername,
          display_name: displayName,
          avatar_url: avatarUrl,
          bio: '',
        }, { onConflict: 'user_id' });
      }

      // Step 3: Fetch the created profile
      const { data: created, error: createdError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (created) {
        console.log('[Auth] Profile created:', created.id);
        
        // Update with OAuth metadata if username is still temp
        if (created.username === tempUsername && displayName !== tempUsername) {
          Promise.resolve(
            supabase
              .from('profiles')
              .update({ display_name: displayName, avatar_url: avatarUrl })
              .eq('id', created.id)
          ).then(() => {
            setProfile({ ...created, display_name: displayName, avatar_url: avatarUrl });
          }).catch(() => {});
        }
        
        setProfile(created);
        checkBanStatus(created.id);
        return created;
      }

      console.warn('[Auth] Profile creation failed:', createdError);
      return null;
    } catch (err) {
      console.error('[Auth] Profile fetch/create error:', err);
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, [profile, checkBanStatus]);

  // Refresh profile (public API)
  const refreshProfile = useCallback(async () => {
    if (AUTH_ONLY_MODE || !user) return;
    profileFetchRef.current = null; // Reset to allow re-fetch
    await fetchOrCreateProfile(user);
  }, [user, fetchOrCreateProfile]);

  // Retry profile if still missing (background)
  useEffect(() => {
    if (AUTH_ONLY_MODE) return;
    if (!user || authPhase !== 'authenticated') return;
    if (profile || profileLoading) return;

    // Retry once after 2 seconds if profile is still null
    const timer = setTimeout(() => {
      console.log('[Auth] Profile retry...');
      profileFetchRef.current = null;
      fetchOrCreateProfile(user).catch(() => {});
    }, 2000);

    return () => clearTimeout(timer);
  }, [user, authPhase, profile, profileLoading, fetchOrCreateProfile]);

  // CORE: Handle session changes - INSTANT auth, profile is background
  const handleSessionChange = useCallback((newSession: Session | null) => {
    console.log('[Auth] Session change:', !!newSession);

    resolvedRef.current = true;
    
    setSession(newSession);
    setUser(newSession?.user ?? null);

    if (newSession?.user) {
      // AUTHENTICATED INSTANTLY
      setAuthPhase('authenticated');
      setLoading(false);
      setAuthReady(true);

      // Fetch/create profile in BACKGROUND - never blocks
      fetchOrCreateProfile(newSession.user).catch(() => {});
    } else {
      // UNAUTHENTICATED
      setProfile(null);
      setBanInfo(null);
      profileFetchRef.current = null;
      setAuthPhase('unauthenticated');
      setLoading(false);
      setAuthReady(true);
    }
  }, [fetchOrCreateProfile]);

  // Initialize auth
  useEffect(() => {
    let mounted = true;

    console.log('[Auth] Initializing...');

    // Listen for auth changes FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      console.log('[Auth] Event:', event);
      handleSessionChange(newSession);
    });

    // Get existing session
    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      
      if (error) {
        console.error('[Auth] getSession error:', error);
        setAuthPhase('unauthenticated');
        setLoading(false);
        setAuthReady(true);
        return;
      }

      handleSessionChange(data.session);
    });

    // Hard failsafe - NEVER block forever
    const failsafe = setTimeout(() => {
      if (mounted && !resolvedRef.current) {
        console.warn('[Auth] Failsafe timeout');
        setAuthPhase('unauthenticated');
        setLoading(false);
        setAuthReady(true);
      }
    }, 4000);

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
    profileFetchRef.current = null;
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

  // Show banned screen
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
