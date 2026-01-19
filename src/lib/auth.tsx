import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { BannedScreen } from '@/components/auth/BannedScreen';
import { MemeBanScreen } from '@/components/auth/MemeBanScreen';

// Token refresh interval - refresh 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

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

  // Auto-redeem pending invite code after profile is fetched
  const autoRedeemPendingInvite = async (profileId: string) => {
    const pendingCode = sessionStorage.getItem('pending_invite_code');
    if (!pendingCode) return;
    
    // Clear immediately to prevent duplicate attempts
    sessionStorage.removeItem('pending_invite_code');
    
    try {
      // Find the invite
      const { data: invite, error: findError } = await supabase
        .from('invites')
        .select('*')
        .eq('invite_code', pendingCode.toUpperCase())
        .single();
      
      if (findError || !invite) {
        console.log('Invite code not found:', pendingCode);
        return;
      }
      
      // Check if already redeemed
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('invite_id', invite.id)
        .eq('redeemer_id', profileId)
        .single();
      
      if (existing) return; // Already redeemed
      
      // Don't allow self-invite
      if (invite.inviter_id === profileId) return;
      
      // Redeem the invite
      await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: invite.id,
          redeemer_id: profileId,
        });
      
      // Update use count
      await supabase
        .from('invites')
        .update({ use_count: (invite.use_count || 0) + 1 })
        .eq('id', invite.id);
      
      // Auto-follow the inviter (ignore if already following)
      try {
        await supabase
          .from('follows')
          .insert({
            follower_id: profileId,
            following_id: invite.inviter_id,
          });
      } catch {
        // Ignore duplicate follow errors
      }
      
      // Send friend request from new user to inviter (ignore if exists)
      try {
        await supabase
          .from('friend_requests')
          .insert({
            sender_id: profileId,
            receiver_id: invite.inviter_id,
            status: 'pending',
          });
      } catch {
        // Ignore duplicate friend request errors
      }
      
      console.log('Invite auto-redeemed successfully for inviter:', invite.inviter_id);
    } catch (error) {
      console.error('Auto-redeem invite failed:', error);
    }
  };

  const fetchProfile = async (userId: string) => {
    // Prefer array result to avoid throwing when the row doesn't exist
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (!error && data?.[0]) {
      setProfile(data[0]);
      // Check ban status and subscribe to realtime changes
      checkBanStatus(data[0].id);
      subscribeToBanChanges(data[0].id);
      // Auto-redeem pending invite after profile is ready
      autoRedeemPendingInvite(data[0].id);
      return data[0];
    }

    // If profile is missing, create it server-side (required for messaging/RLS)
    const { error: ensureError } = await supabase.rpc('ensure_profile');
    if (ensureError) {
      console.error('ensure_profile failed:', ensureError);
      setProfile(null);
      return null;
    }

    const { data: afterEnsure, error: afterEnsureError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (!afterEnsureError && afterEnsure?.[0]) {
      setProfile(afterEnsure[0]);
      // Check ban status and subscribe to realtime changes
      checkBanStatus(afterEnsure[0].id);
      subscribeToBanChanges(afterEnsure[0].id);
      // Auto-redeem pending invite after profile is ready
      autoRedeemPendingInvite(afterEnsure[0].id);
      return afterEnsure[0];
    }

    setProfile(null);
    return null;
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Schedule token refresh for persistent sessions
          if (session.expires_at) {
            scheduleTokenRefresh(session.expires_at);
          }
          
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
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
    supabase.auth.getSession().then(({ data: { session } }) => {
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
    await supabase.auth.signOut();
    setProfile(null);
  };

  const updateProfile = async (updates: Partial<Profile>) => {
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
