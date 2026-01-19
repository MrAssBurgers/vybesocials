import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { analytics } from '@/lib/analytics';
import { setPendingReferral, clearPendingReferral, type PendingReferral } from '@/lib/referral';
import Landing from '@/pages/Landing';

/**
 * Persistent Invite Entry Mode
 * 
 * /invite/:username is NOT a redirect page.
 * It's the SAME app as /, just with invite context stored.
 * 
 * The user stays on /invite/:username through:
 * - Intro flow
 * - Signup/Login
 * - Onboarding  
 * - Tutorial
 * 
 * After tutorial → referral confirmation modal appears.
 * 
 * URL remains /invite/:username until natural navigation.
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

export default function InviteRedeem() {
  const { identifier } = useParams<{ identifier: string }>();
  const [inviteProcessed, setInviteProcessed] = useState(false);
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
  
  // Process invite once on mount - store referral data, then render Landing
  useEffect(() => {
    // Prevent double processing
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
          console.log('[InviteRedeem] Entry mode set to: invite');
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
  
  // Don't render anything until invite is processed
  // This ensures referral data is stored before Landing mounts
  if (!inviteProcessed) {
    return (
      <div className="min-h-screen bg-background" />
    );
  }
  
  // Render the exact same Landing page
  // User stays on /invite/:username but sees the full first-time experience
  return <Landing />;
}
