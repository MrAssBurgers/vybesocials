import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';

/**
 * Silent Invite Handler - Background Referral Processing
 * 
 * This page runs SILENTLY in the background:
 * 1. Validates inviter exists
 * 2. Stores referral in persistent storage
 * 3. Redirects to normal app flow immediately
 * 
 * NO UI is shown to the user - they get the full first-time experience
 * just like any other user. The referral confirmation happens AFTER signup.
 * 
 * URL formats supported:
 * - /invite/@username
 * - /invite/username  
 * - /invite/userId (UUID format)
 */
export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const navigate = useNavigate();
  const [processing, setProcessing] = useState(true);
  
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
  
  // Process invite silently and redirect
  useEffect(() => {
    async function processInvite() {
      // Track invite link opened
      if (parsed) {
        analytics.inviteLinkOpened({ inviteCode: parsed.value });
      }
      
      // If no valid identifier, go straight to normal flow
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
          setPendingReferral(referralData);
          console.log('[InviteRedeem] Stored referral for:', inviterProfile.username);
        } else {
          // Invalid inviter - clear any existing referral and continue normally
          console.log('[InviteRedeem] Inviter not found, continuing without referral');
          clearPendingReferral();
        }
      } catch (err) {
        console.error('[InviteRedeem] Error processing invite:', err);
        clearPendingReferral();
      }
      
      // Always redirect to normal app flow - user gets full experience
      // Referral will be processed after account creation
      setProcessing(false);
      navigate('/', { replace: true });
    }
    
    processInvite();
  }, [parsed?.type, parsed?.value, navigate]);
  
  // Brief loading state while processing (usually < 1 second)
  if (processing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return null;
}
