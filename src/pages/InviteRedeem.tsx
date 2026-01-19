import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { analytics } from '@/lib/analytics';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';

/**
 * Silent Invite Handler - 100% Background Processing
 * 
 * User experience is IDENTICAL to non-referred users:
 * 1. Open invite link
 * 2. Brief loading (< 1 second)
 * 3. Redirect based on auth state:
 *    - NOT logged in → `/` (splash → intro → signup → onboarding)
 *    - Logged in → `/home` (InvitePopup will show there)
 * 4. Referral popup appears AFTER they're fully set up
 * 
 * NO special screens, NO interruptions, NO differences.
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [processing, setProcessing] = useState(true);
  
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
  
  const parsed = parseIdentifier(identifier);
  
  // Process invite silently in background, then redirect based on auth state
  useEffect(() => {
    // Wait for auth to be determined
    if (authLoading) return;
    
    async function processInvite() {
      if (parsed) {
        analytics.inviteLinkOpened({ inviteCode: parsed.value });
      }
      
      if (!parsed) {
        console.log('[InviteRedeem] No valid identifier');
        navigate(user ? '/home' : '/', { replace: true });
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
        
        // Find inviter
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
          // Store referral silently - user won't know until after signup
          const referralData: PendingReferral = {
            inviterId: inviterProfile.id,
            inviterUserId: inviterProfile.user_id,
            inviterUsername: inviterProfile.username,
            inviterDisplayName: inviterProfile.display_name,
            inviterAvatarUrl: inviterProfile.avatar_url,
            timestamp: Date.now(),
          };
          setPendingReferral(referralData);
          console.log('[InviteRedeem] Stored referral silently:', inviterProfile.username);
        } else {
          console.log('[InviteRedeem] Inviter not found, continuing normally');
          clearPendingReferral();
        }
      } catch (err) {
        console.error('[InviteRedeem] Error:', err);
        clearPendingReferral();
      }
      
      setProcessing(false);
      
      // Redirect based on whether user is already logged in
      if (user) {
        // Already logged in - go to home, InvitePopup will show there
        console.log('[InviteRedeem] User logged in, going to /home');
        navigate('/home', { replace: true });
      } else {
        // Not logged in - go to landing for normal first-time experience
        console.log('[InviteRedeem] User not logged in, going to /');
        navigate('/', { replace: true });
      }
    }
    
    processInvite();
  }, [parsed?.type, parsed?.value, navigate, user, authLoading]);
  
  // Brief loading while we store the referral
  if (processing || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return null;
}
