import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';
import { useAuth } from '@/lib/auth';

// Import components for inline rendering
import Landing from '@/pages/Landing';
import CompleteProfile from '@/pages/CompleteProfile';
import Onboarding from '@/pages/Onboarding';
import Home from '@/pages/Home';

/**
 * Persistent Invite Entry Mode
 * 
 * /invite/:username is a URL ALIAS for / (not a separate page).
 * It renders the SAME app experience as / but with invite context attached.
 * 
 * The URL NEVER changes during:
 * - Intro flow
 * - Signup/Login
 * - Complete Profile
 * - Onboarding  
 * - Tutorial (on Home)
 * 
 * After "Thanks!" in referral modal → redirect to /home.
 */

const ENTRY_MODE_KEY = 'vybe_entry_mode';

export function setEntryMode(mode: 'invite' | 'normal'): void {
  try {
    localStorage.setItem(ENTRY_MODE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
}

export function getEntryMode(): string | null {
  try {
    return localStorage.getItem(ENTRY_MODE_KEY);
  } catch {
    return null;
  }
}

export function clearEntryMode(): void {
  try {
    localStorage.removeItem(ENTRY_MODE_KEY);
  } catch {
    // Ignore storage errors
  }
}

// Stage type for internal state machine
// CRITICAL: Always start at 'landing' to show intro - regardless of auth state
type InviteFlowStage = 'loading' | 'landing' | 'complete-profile' | 'onboarding' | 'home';

export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const { user, profile, loading: authLoading, authReady } = useAuth();
  const [inviteProcessed, setInviteProcessed] = useState(false);
  // CRITICAL: Start at 'loading' to wait for auth before deciding stage
  const [currentStage, setCurrentStage] = useState<InviteFlowStage>('loading');
  // Track if user has completed the intro (landing stage)
  const [introCompleted, setIntroCompleted] = useState(false);
  const processedRef = useRef(false);
  
  // Parse identifier - handles @username, username, or UUID
  const parseIdentifier = (id: string | undefined): { type: 'username' | 'uuid'; value: string } | null => {
    if (!id) return null;
    
    const cleaned = id.startsWith('@') ? id.slice(1) : id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(cleaned)) {
      return { type: 'uuid', value: cleaned };
    }
    
    return { type: 'username', value: cleaned };
  };
  
  // Process invite ONCE on mount - store referral data
  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;
    
    async function processInvite() {
      const parsed = parseIdentifier(identifier);
      
      if (parsed) {
        analytics.inviteLinkOpened({ inviteCode: parsed.value });
      }
      
      if (!parsed) {
        console.log('[InviteRedeem] No valid identifier, proceeding as normal');
        setInviteProcessed(true);
        return;
      }
      
      try {
        let inviterProfile: { 
          id: string; 
          username: string; 
          avatar_url: string | null;
          display_name: string | null;
          user_id: string;
        } | null = null;
        
        // Find inviter by username or UUID
        if (parsed.type === 'uuid') {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name, user_id')
            .eq('id', parsed.value)
            .maybeSingle();
          inviterProfile = data;
        } else {
          const { data } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name, user_id')
            .ilike('username', parsed.value.toLowerCase())
            .maybeSingle();
          inviterProfile = data;
        }
        
        if (inviterProfile) {
          // Store referral data - this also resets intro for first-time experience
          const referralData: PendingReferral = {
            inviterId: inviterProfile.id,
            inviterUserId: inviterProfile.user_id,
            inviterUsername: inviterProfile.username,
            inviterDisplayName: inviterProfile.display_name,
            inviterAvatarUrl: inviterProfile.avatar_url,
            timestamp: Date.now(),
          };
          setPendingReferral(referralData);
          
          // Mark entry mode as invite
          setEntryMode('invite');
          
          console.log('[InviteRedeem] Stored referral for:', inviterProfile.username);
        } else {
          console.log('[InviteRedeem] Inviter not found, proceeding as normal');
          clearPendingReferral();
        }
      } catch (err) {
        console.error('[InviteRedeem] Error:', err);
        clearPendingReferral();
      }
      
      setInviteProcessed(true);
    }
    
    processInvite();
  }, [identifier]);
  
  // Determine which stage to show
  // CRITICAL: Always show landing FIRST (intro) regardless of auth state
  // Only after introCompleted, check auth state to determine next stage
  useEffect(() => {
    if (!inviteProcessed) {
      setCurrentStage('loading');
      return;
    }
    
    // ALWAYS show landing (intro) first for invite links
    // This ensures invited users ALWAYS see the intro page first
    if (!introCompleted) {
      setCurrentStage('landing');
      return;
    }
    
    // After intro is done, wait for authReady (not just authLoading)
    if (!authReady) {
      return;
    }
    
    // Intro completed - now check auth state for next stage
    // Not authenticated - stay on landing for signup/login
    if (!user) {
      setCurrentStage('landing');
      return;
    }
    
    // Authenticated but profile not loaded yet - wait (prevents flashing CompleteProfile)
    if (!profile) {
      setCurrentStage('loading');
      return;
    }

    // Authenticated but no username - complete profile
    if (!profile.username) {
      setCurrentStage('complete-profile');
      return;
    }

    // Has profile but onboarding not complete
    if (!profile.onboarding_completed) {
      setCurrentStage('onboarding');
      return;
    }

    // Fully onboarded - show home (tutorial + invite popup will trigger there)
    setCurrentStage('home');
  }, [inviteProcessed, authReady, user, profile, introCompleted]);
  
  // Handle stage transitions (called by child components instead of navigate())
  const handleStageComplete = (nextStage: 'landing' | 'complete-profile' | 'onboarding' | 'home') => {
    console.log('[InviteRedeem] Stage transition:', currentStage, '->', nextStage);
    
    // When leaving landing stage, mark intro as completed
    if (currentStage === 'landing' && nextStage !== 'landing') {
      setIntroCompleted(true);
    }
    
    setCurrentStage(nextStage);
  };
  
  // Loading state - minimal blank screen (matches normal app loading)
  if (currentStage === 'loading') {
    return <div className="min-h-screen bg-background" />;
  }
  
  // Render appropriate component based on stage
  // ALL components receive isInviteMode=true and onInviteNavigate callback
  // This prevents them from calling navigate() and changing the URL
  switch (currentStage) {
    case 'landing':
      return (
        <Landing 
          onInviteNavigate={handleStageComplete}
          isInviteMode={true}
        />
      );
    
    case 'complete-profile':
      return (
        <CompleteProfile 
          onInviteNavigate={handleStageComplete}
          isInviteMode={true}
        />
      );
    
    case 'onboarding':
      return (
        <Onboarding 
          onInviteNavigate={handleStageComplete}
          isInviteMode={true}
        />
      );
    
    case 'home':
      return (
        <Home 
          isInviteMode={true}
        />
      );
    
    default:
      // Fallback to landing
      return (
        <Landing 
          onInviteNavigate={handleStageComplete}
          isInviteMode={true}
        />
      );
  }
}
