import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  getPendingReferral,
  clearPendingReferral,
  markPopupDismissed,
  wasPopupDismissed,
  markReferralConsumed,
  wasReferralConsumed,
  cleanupReferralStorage,
  type PendingReferral,
} from '@/lib/referral';

/**
 * Post-signup popup that asks user if they want to add their inviter as friend.
 * 
 * Flow:
 * 1. User visits invite link → inviter data stored in localStorage
 * 2. User signs up and account creation completes
 * 3. This component detects the pending referral and shows modal
 * 4. User can add friend or dismiss
 * 5. Inviter reward is granted exactly once (tracked via invite_redemptions)
 * 6. Cleanup happens after flow completes
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const processedRef = useRef(false);
  const rewardGrantedRef = useRef(false);

  // Process pending referral when auth is fully ready
  useEffect(() => {
    // Wait for complete auth state
    if (!user?.id || !profile?.id) {
      console.log('[InvitePopup] Auth not ready yet');
      return;
    }
    
    // Prevent multiple processing in same session
    if (processedRef.current) return;
    
    const processPendingReferral = async () => {
      const pending = getPendingReferral();
      
      if (!pending) {
        console.log('[InvitePopup] No pending referral');
        return;
      }
      
      console.log('[InvitePopup] Found pending referral for:', pending.inviterUsername);
      
      // Check if popup was already dismissed for this referral
      if (wasPopupDismissed()) {
        console.log('[InvitePopup] Popup was already dismissed');
        cleanupReferralStorage();
        return;
      }
      
      // Don't allow self-referral
      if (pending.inviterId === profile.id) {
        console.log('[InvitePopup] Self-referral, clearing');
        cleanupReferralStorage();
        return;
      }
      
      // Verify inviter still exists
      const { data: inviterProfile, error } = await supabase
        .from('public_profiles')
        .select('id, username, avatar_url, display_name')
        .eq('id', pending.inviterId)
        .maybeSingle();
      
      if (error || !inviterProfile) {
        console.log('[InvitePopup] Inviter no longer exists, clearing');
        cleanupReferralStorage();
        return;
      }
      
      // Update referral with fresh data
      const freshReferral: PendingReferral = {
        inviterId: inviterProfile.id,
        inviterUsername: inviterProfile.username,
        inviterDisplayName: inviterProfile.display_name,
        inviterAvatarUrl: inviterProfile.avatar_url,
        timestamp: pending.timestamp,
      };
      
      setReferral(freshReferral);
      setVisible(true);
      processedRef.current = true;
      
      console.log('[InvitePopup] Showing popup for:', inviterProfile.username);
    };

    // Delay to ensure UI is settled and auth is fully ready
    const timer = setTimeout(processPendingReferral, 800);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id]);

  /**
   * Grant reward to inviter - happens ONCE per new user
   * Uses invite_redemptions table to prevent duplicates
   */
  const grantInviterReward = useCallback(async (inviterId: string, redeemerId: string) => {
    // Prevent duplicate calls in same session
    if (rewardGrantedRef.current) {
      console.log('[InvitePopup] Reward already granted this session');
      return;
    }
    
    // Check local flag first (quick check)
    if (wasReferralConsumed()) {
      console.log('[InvitePopup] Referral already consumed (local)');
      return;
    }
    
    try {
      // Check if this user already has a redemption (server-side dedup)
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('redeemer_id', redeemerId)
        .maybeSingle();
      
      if (existing) {
        console.log('[InvitePopup] User already redeemed an invite');
        markReferralConsumed();
        return;
      }
      
      // Get inviter's user_id from their profile to find their invite
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', inviterId)
        .single();
      
      if (!inviterProfile?.user_id) {
        console.log('[InvitePopup] Could not find inviter user_id');
        return;
      }
      
      // Find the inviter's invite record
      const { data: existingInvite } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', inviterProfile.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let inviteId: string;
      let currentUseCount: number = 0;
      
      if (!existingInvite) {
        // Create an invite record for the inviter if they don't have one
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const { data: newInvite, error: createError } = await supabase
          .from('invites')
          .insert({
            inviter_id: inviterProfile.user_id,
            invite_code: inviteCode,
            use_count: 0,
          })
          .select('id, use_count')
          .single();
        
        if (createError || !newInvite) {
          console.log('[InvitePopup] Could not create invite for inviter');
          return;
        }
        inviteId = newInvite.id;
        currentUseCount = newInvite.use_count || 0;
      } else {
        inviteId = existingInvite.id;
        currentUseCount = existingInvite.use_count || 0;
      }
      
      // Create redemption record
      const { error: redemptionError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: inviteId,
          redeemer_id: redeemerId,
        });
      
      if (redemptionError) {
        // Unique constraint violation = already redeemed
        if (redemptionError.code === '23505') {
          console.log('[InvitePopup] Redemption already exists');
          markReferralConsumed();
          return;
        }
        console.error('[InvitePopup] Failed to create redemption:', redemptionError);
        return;
      }
      
      // Increment use count
      await supabase
        .from('invites')
        .update({ use_count: currentUseCount + 1 })
        .eq('id', inviteId);
      
      // Mark as consumed
      markReferralConsumed();
      rewardGrantedRef.current = true;
      
      console.log('[InvitePopup] Inviter reward granted successfully');
    } catch (error) {
      console.error('[InvitePopup] Error granting reward:', error);
      // Don't block user flow on reward failure
    }
  }, []);

  const handleAddFriend = async () => {
    if (!profile?.id || !referral) return;
    
    setLoading(true);
    
    try {
      // Check for existing friend request in either direction
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${referral.inviterId}),and(sender_id.eq.${referral.inviterId},receiver_id.eq.${profile.id})`)
        .maybeSingle();
      
      if (!existingRequest) {
        // Send new friend request
        const { error } = await supabase
          .from('friend_requests')
          .insert({
            sender_id: profile.id,
            receiver_id: referral.inviterId,
            status: 'pending',
          });
        
        if (!error) {
          toast.success(`Friend request sent to @${referral.inviterUsername}!`);
        }
      } else if (existingRequest.status === 'pending') {
        toast.info(`Friend request already pending with @${referral.inviterUsername}`);
      } else if (existingRequest.status === 'accepted') {
        toast.info(`You're already friends with @${referral.inviterUsername}!`);
      }
      
      // Also follow the inviter
      await supabase
        .from('follows')
        .upsert({
          follower_id: profile.id,
          following_id: referral.inviterId,
        }, { onConflict: 'follower_id,following_id' });
      
      // Grant reward to inviter
      await grantInviterReward(referral.inviterId, profile.id);
      
      handleClose();
    } catch (error: any) {
      console.error('[InvitePopup] Failed to add friend:', error);
      // Still grant reward and close even if friend request fails
      await grantInviterReward(referral.inviterId, profile.id);
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  const handleNotNow = async () => {
    if (profile?.id && referral) {
      // Grant reward even if user doesn't add as friend
      await grantInviterReward(referral.inviterId, profile.id);
    }
    handleClose();
  };

  const handleClose = () => {
    setVisible(false);
    markPopupDismissed();
    // Full cleanup after a short delay for animation
    setTimeout(() => {
      cleanupReferralStorage();
    }, 300);
  };

  if (!visible || !referral) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleNotNow}
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-sm liquid-glass-card rounded-2xl p-6 shadow-xl"
        >
          {/* Close button */}
          <button
            onClick={handleNotNow}
            className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted/50 transition-colors"
            disabled={loading}
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
          
          {/* Content */}
          <div className="text-center space-y-4">
            {/* Avatar */}
            <div className="flex justify-center">
              <Avatar className="h-20 w-20 ring-4 ring-primary/20">
                <AvatarImage src={referral.inviterAvatarUrl || undefined} />
                <AvatarFallback className="text-2xl gradient-animated text-white">
                  {referral.inviterUsername?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            
            {/* Title */}
            <div>
              <h2 className="text-xl font-bold">
                You joined using @{referral.inviterUsername}'s invite
              </h2>
              <p className="text-muted-foreground mt-2">
                Would you like to add them as a friend?
              </p>
            </div>
            
            {/* Buttons */}
            <div className="space-y-2 pt-2">
              <Button
                className="w-full gradient-animated"
                size="lg"
                onClick={handleAddFriend}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Add Friend
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                size="lg"
                onClick={handleNotNow}
                disabled={loading}
              >
                Not Now
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
