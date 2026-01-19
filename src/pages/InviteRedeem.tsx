import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';

/**
 * Silent Invite Handler - Professional First-Time Experience
 * 
 * When someone opens an invite link, they MUST get the same experience
 * as any first-time user:
 * 
 * 1. Open invite link
 * 2. Brief loading (validate inviter)
 * 3. Store referral silently (also resets intro)
 * 4. Redirect to / for FULL first-time experience:
 *    - Splash screen
 *    - Intro flow (3 slides)
 *    - Create Account / Log In
 *    - Onboarding
 *    - Tutorial
 * 5. AFTER tutorial → referral confirmation modal appears
 * 
 * NO special screens. NO shortcuts. Identical to organic users.
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
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
  
  // Process invite silently, then redirect to landing for first-time experience
  useEffect(() => {
    async function processInvite() {
      if (parsed) {
        analytics.inviteLinkOpened({ inviteCode: parsed.value });
      }
      
      if (!parsed) {
        console.log('[InviteRedeem] No valid identifier, going to landing');
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
          // Store referral silently - this also resets intro for first-time experience
          const referralData: PendingReferral = {
            inviterId: inviterProfile.id,
            inviterUserId: inviterProfile.user_id,
            inviterUsername: inviterProfile.username,
            inviterDisplayName: inviterProfile.display_name,
            inviterAvatarUrl: inviterProfile.avatar_url,
            timestamp: Date.now(),
          };
          setPendingReferral(referralData);
          console.log('[InviteRedeem] Stored referral for:', inviterProfile.username);
        } else {
          console.log('[InviteRedeem] Inviter not found, continuing normally');
          clearPendingReferral();
        }
      } catch (err) {
        console.error('[InviteRedeem] Error:', err);
        clearPendingReferral();
      }
      
      setProcessing(false);
      
      // ALWAYS redirect to landing for full first-time experience
      // The setPendingReferral call already reset the intro
      console.log('[InviteRedeem] Redirecting to / for first-time experience');
      navigate('/', { replace: true });
    }
    
    processInvite();
  }, [parsed?.type, parsed?.value, navigate]);
  
  // Brief loading while we validate and store the referral
  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return null;
}
