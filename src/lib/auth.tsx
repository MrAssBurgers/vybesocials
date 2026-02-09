import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';
import { setCachedProfile, clearProfileCache } from '@/lib/profileCache';
import { resetThemeToDefault } from '@/lib/themeReset';
import { logEvent } from '@/lib/debugLogger';

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
  banInfo: BanInfo | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
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
      .select('reason, expires_at, is_permanent, is_meme_ban')
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
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (!error && data?.[0]) {
        const profileData = data[0] as unknown as Profile;
        setProfile(profileData);
        // Cache profile for instant lookups elsewhere
        setCachedProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
        });
        // Check ban status and subscribe to realtime changes
        checkBanStatus(profileData.id);
        subscribeToBanChanges(profileData.id);
        return profileData;
      }

      // If profile is missing, try to claim an unclaimed profile or create new one
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
        console.warn('[Auth] Using fallback profile, app may have limited functionality');
        return fallbackProfile;
      }

      // Fetch the newly created profile
      const { data: afterEnsure, error: afterEnsureError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .limit(1);

      if (!afterEnsureError && afterEnsure?.[0]) {
        const profileData = afterEnsure[0] as unknown as Profile;
        setProfile(profileData);
        // Cache profile for instant lookups elsewhere
        setCachedProfile({
          id: profileData.id,
          username: profileData.username,
          display_name: profileData.display_name || null,
          avatar_url: profileData.avatar_url,
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
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logEvent('auth', `onAuthStateChange: ${event}`, { hasSession: !!session });
        // Skip if already initialized from getSession (prevents double profile fetches)
        if (!authInitializedRef.current && event === 'INITIAL_SESSION') {
          return; // Let getSession handle the first initialization
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          logEvent('auth', 'Session active, fetching profile', { userId: session.user.id });
          // Schedule token refresh for persistent sessions
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          logEvent('auth', 'No session — signed out');
          setProfile(null);
          clearProfileCache(); // Clear cache on logout
          setBanInfo(null);
          // Clear refresh timer on logout
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = null;
          }
          // Clean up ban subscription
          if (banSubscriptionRef.current) {
            supabase.removeChannel(banSubscriptionRef.current);
            banSubscriptionRef.current = null;
          }
          // Clear ban expiry timer
          clearBanExpiryTimer();
        }
        
        setLoading(false);
        setIsInitialized(true);
      }
    );

    // THEN check for existing session - this restores session from localStorage
    logEvent('auth', 'Initializing: checking existing session');
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Mark as initialized so onAuthStateChange skips duplicate handling
      authInitializedRef.current = true;
      
      logEvent('auth', 'getSession resolved', { hasSession: !!session, userId: session?.user?.id });
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Schedule token refresh for persistent sessions
        if (session.expires_at) {
          scheduleTokenRefresh(session.expires_at);
        }
        fetchProfile(session.user.id);
      }
      
      setLoading(false);
      setIsInitialized(true);
    });

    // Handle "session-only" mode (Remember Me unchecked)
    // Clear session when browser/tab is closed
    const handleBeforeUnload = () => {
      if (sessionStorage.getItem('vybe-session-only') === 'true') {
        // Clear the auth data from localStorage so session doesn't persist
        localStorage.removeItem('sb-eabvbtkxdbttjpdpbmuw-auth-token');
        sessionStorage.removeItem('vybe-session-only');
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Cleanup on unmount
    return () => {
      subscription.unsubscribe();
      window.removeEventListener('beforeunload', handleBeforeUnload);
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
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      if (data.user) {
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: data.user.id,
            username: username.toLowerCase().replace(/\s+/g, ''),
            bio: '',
          });

        if (profileError) throw profileError;
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

  const signOut = async () => {
    clearProfileCache(); // Clear cache on logout
    
    // Clear VYBE theme from localStorage so new accounts start fresh
    localStorage.removeItem('vybe-font-body');
    localStorage.removeItem('vybe-font-display');
    localStorage.removeItem('vybe-anim-speed');
    localStorage.removeItem('vybe-anim-style');
    localStorage.removeItem('vybe-custom-animations');
    
    // Remove custom animation styles
    const customAnimStyle = document.getElementById('vybe-custom-animations');
    if (customAnimStyle) {
      customAnimStyle.remove();
    }
    
    // Reset CSS variables to defaults
    const root = document.documentElement;
    root.style.removeProperty('--font-body');
    root.style.removeProperty('--font-display');
    root.style.fontFamily = 'system-ui, sans-serif';
    
    // Reset ALL theme CSS variables to default classic theme
    resetThemeToDefault();
    
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!profile) return { error: new Error('No profile') };

    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates as Record<string, unknown>)
        .eq('id', profile.id);

      if (error) throw error;

      setProfile({ ...profile, ...updates });
      return { error: null };
    } catch (error) {
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
      banInfo,
      signUp,
      signIn,
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
