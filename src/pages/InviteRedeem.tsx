import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { analytics } from '@/lib/analytics';
import { 
  setPendingReferral, 
  clearPendingReferral, 
  getPendingReferral,
  type PendingReferral 
} from '@/lib/referral';
import { ReferralWelcome } from '@/components/invite/ReferralWelcome';

/**
 * Polished Invite Handler - Professional First-Time UX
 * 
 * Flow:
 * 1. User opens /invite/:username
 * 2. Validate inviter exists
 * 3. Show premium welcome screen (not instant redirect)
 * 4. User taps "Continue" → Full intro experience → Signup
 * 5. User taps "Sign In" → Login flow
 * 6. After account creation → Referral confirmation modal
 * 
 * URL formats supported:
 * - /invite/@username
 * - /invite/username  
 * - /invite/userId (UUID format)
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [error, setError] = useState(false);
  
  // Parse identifier - handles @username, username, or UUID
  const parseIdentifier = (id: string | undefined): { type: 'username' | 'uuid'; value: string } | null => {
    if (!id) return null;
    
    // Remove @ prefix if present
    const cleaned = id.startsWith('@') ? id.slice(1) : id;
    
    // Check if it's a UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(cleaned)) {
      return { type: 'uuid', value: cleaned };
    }
    
    return { type: 'username', value: cleaned };
  };
  
  const parsed = parseIdentifier(identifier);
  
  // If user is already logged in, redirect to home with referral stored
  useEffect(() => {
    if (user) {
      // User already has account, just go home
      // The InvitePopup will handle showing confirmation if there's a pending referral
      navigate('/home', { replace: true });
    }
  }, [user, navigate]);
  
  // Fetch inviter data and prepare welcome screen
  useEffect(() => {
    if (user) return; // Skip if already logged in
    
    async function fetchInviter() {
      // Track invite link opened
      if (parsed) {
        analytics.inviteLinkOpened({ inviteCode: parsed.value });
      }
      
      // If no valid identifier, redirect normally
      if (!parsed) {
        console.log('[InviteRedeem] No valid identifier, proceeding normally');
        navigate('/', { replace: true });
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
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name, user_id')
            .eq('id', parsed.value)
            .maybeSingle();
          
          if (!error && data) {
            inviterProfile = data;
          }
        } else {
          const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url, display_name, user_id')
            .ilike('username', parsed.value.toLowerCase())
            .maybeSingle();
          
          if (!error && data) {
            inviterProfile = data;
          }
        }
        
        if (inviterProfile) {
          // Store complete referral data for post-signup
          const referralData: PendingReferral = {
            inviterId: inviterProfile.id,
            inviterUserId: inviterProfile.user_id,
            inviterUsername: inviterProfile.username,
            inviterDisplayName: inviterProfile.display_name,
            inviterAvatarUrl: inviterProfile.avatar_url,
            timestamp: Date.now(),
          };
          
          // Store immediately in case user refreshes
          setPendingReferral(referralData);
          setReferral(referralData);
          
          console.log('[InviteRedeem] Found inviter:', inviterProfile.username);
        } else {
          // Invalid inviter - redirect normally
          console.log('[InviteRedeem] Inviter not found');
          setError(true);
          clearPendingReferral();
        }
      } catch (err) {
        console.error('[InviteRedeem] Error fetching inviter:', err);
        setError(true);
        clearPendingReferral();
      }
      
      setLoading(false);
    }
    
    fetchInviter();
  }, [parsed?.type, parsed?.value, navigate, user]);
  
  // Handle continue button - go to landing with intro
  const handleContinue = () => {
    // Navigate to landing page - intro will show first, then auth
    navigate('/', { replace: true });
  };
  
  // Handle sign in button - go to landing in login mode
  const handleSignIn = () => {
    navigate('/?mode=login', { replace: true });
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  // Error state - redirect to normal flow
  if (error || !referral) {
    navigate('/', { replace: true });
    return null;
  }
  
  // Show premium welcome screen
  return (
    <ReferralWelcome
      referral={referral}
      onContinue={handleContinue}
      onSignIn={handleSignIn}
    />
  );
}
