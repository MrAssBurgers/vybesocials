import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  getPendingReferral,
  wasReferralConfirmed,
  markReferralConfirmed,
  cleanupReferralStorage,
  type PendingReferral,
} from '@/lib/referral';

/**
 * Post-Tutorial/Onboarding Referral Confirmation Modal
 * 
 * TRIGGER CONDITIONS (ALL must be true):
 * - User is authenticated (user.id exists)
 * - User has a profile (profile.id exists)
 * - Onboarding is complete (profile.onboarding_completed = true)
 * - Tutorial is complete OR skipped (check DB directly for reliability)
 * - Pending referral exists in localStorage
 * - Referral not yet confirmed
 * 
 * FLOW:
 * 1. Listen for 'tutorial-completed' event OR poll profile status
 * 2. When conditions met, show modal
 * 3. On "Thank You" click: add friend, grant reward, notify inviter
 * 4. Cleanup and close
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const processedRef = useRef(false);
  const rewardGrantedRef = useRef(false);

  // Check for pending referral when conditions are met
  const checkAndShowReferral = useCallback(async () => {
    // Already processed or visible
    if (processedRef.current || visible) return;
    
    // Require auth
    if (!user?.id || !profile?.id) {
      console.log('[InvitePopup] Waiting for auth');
      return;
    }
    
    // Already confirmed?
    if (wasReferralConfirmed()) {
      console.log('[InvitePopup] Referral already confirmed');
      cleanupReferralStorage();
      return;
    }
    
    // Check for pending referral
    const pending = getPendingReferral();
    if (!pending) {
      console.log('[InvitePopup] No pending referral');
      return;
    }
    
    // Prevent self-referral
    if (pending.inviterId === profile.id) {
      console.log('[InvitePopup] Self-referral detected, clearing');
      cleanupReferralStorage();
      return;
    }
    
    // Check if onboarding AND tutorial are complete (query DB directly for reliability)
    try {
      const { data: profileData, error } = await supabase
        .from('profiles')
        .select('onboarding_completed, tutorial_completed, tutorial_skipped')
        .eq('id', profile.id)
        .single();
      
      if (error) {
        console.error('[InvitePopup] Error checking profile:', error);
        return;
      }
      
      const onboardingDone = profileData?.onboarding_completed ?? false;
      const tutorialDone = (profileData?.tutorial_completed ?? false) || (profileData?.tutorial_skipped ?? false);
      
      console.log('[InvitePopup] Status check:', { onboardingDone, tutorialDone });
      
      // MUST have completed both onboarding AND tutorial
      if (!onboardingDone || !tutorialDone) {
        console.log('[InvitePopup] Waiting for onboarding/tutorial completion');
        return;
      }
    } catch (e) {
      console.error('[InvitePopup] Error:', e);
      return;
    }
    
    console.log('[InvitePopup] All conditions met, showing modal for:', pending.inviterUsername);
    
    // Verify inviter still exists
    const { data: inviterProfile, error: inviterError } = await supabase
      .from('profiles')
      .select('id, user_id, username, avatar_url, display_name')
      .eq('id', pending.inviterId)
      .maybeSingle();
    
    if (inviterError || !inviterProfile) {
      console.log('[InvitePopup] Inviter no longer exists');
      cleanupReferralStorage();
      return;
    }
    
    // Update with fresh data
    const freshReferral: PendingReferral = {
      inviterId: inviterProfile.id,
      inviterUserId: inviterProfile.user_id,
      inviterUsername: inviterProfile.username,
      inviterDisplayName: inviterProfile.display_name,
      inviterAvatarUrl: inviterProfile.avatar_url,
      timestamp: pending.timestamp,
    };
    
    setReferral(freshReferral);
    setVisible(true);
    processedRef.current = true;
    
    console.log('[InvitePopup] Showing confirmation modal');
  }, [user?.id, profile?.id, visible]);

  // Listen for tutorial-completed event
  useEffect(() => {
    const handleTutorialComplete = () => {
      console.log('[InvitePopup] Tutorial completed event received');
      // Delay slightly to let state settle
      setTimeout(() => checkAndShowReferral(), 500);
    };
    
    window.addEventListener('tutorial-completed', handleTutorialComplete);
    return () => window.removeEventListener('tutorial-completed', handleTutorialComplete);
  }, [checkAndShowReferral]);

  // Also check on mount and when auth changes (for users who already completed tutorial)
  useEffect(() => {
    if (!user?.id || !profile?.id) return;
    
    // Delay initial check to let app settle
    const timer = setTimeout(() => checkAndShowReferral(), 1500);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id, checkAndShowReferral]);

  /**
   * Grant reward to inviter and send notification
   */
  const grantRewardAndNotify = useCallback(async (
    inviterUserId: string, 
    inviterProfileId: string,
    redeemerProfileId: string
  ) => {
    if (rewardGrantedRef.current) {
      console.log('[InvitePopup] Reward already granted');
      return true;
    }
    
    try {
      console.log('[InvitePopup] Granting reward to inviter');
      
      // Check if already redeemed
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('redeemer_id', redeemerProfileId)
        .maybeSingle();
      
      if (existing) {
        console.log('[InvitePopup] Already redeemed');
        rewardGrantedRef.current = true;
        return true;
      }
      
      // Find or create invite record
      const { data: existingInvite } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', inviterUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let inviteId: string;
      let currentUseCount = 0;
      
      if (!existingInvite) {
        const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const { data: newInvite, error: createError } = await supabase
          .from('invites')
          .insert({
            inviter_id: inviterUserId,
            invite_code: inviteCode,
            use_count: 0,
          })
          .select('id, use_count')
          .single();
        
        if (createError || !newInvite) {
          console.error('[InvitePopup] Failed to create invite:', createError);
          return false;
        }
        inviteId = newInvite.id;
      } else {
        inviteId = existingInvite.id;
        currentUseCount = existingInvite.use_count || 0;
      }
      
      // Create redemption
      const { error: redemptionError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: inviteId,
          redeemer_id: redeemerProfileId,
        });
      
      if (redemptionError && redemptionError.code !== '23505') {
        console.error('[InvitePopup] Redemption error:', redemptionError);
        return false;
      }
      
      // Update use count
      await supabase
        .from('invites')
        .update({ use_count: currentUseCount + 1 })
        .eq('id', inviteId);
      
      // Send notification to inviter
      await supabase
        .from('notifications')
        .insert({
          user_id: inviterProfileId,
          actor_id: redeemerProfileId,
          type: 'invite_accepted',
        });
      
      console.log('[InvitePopup] Reward granted and notification sent!');
      rewardGrantedRef.current = true;
      return true;
    } catch (error) {
      console.error('[InvitePopup] Error granting reward:', error);
      return false;
    }
  }, []);

  /**
   * Auto-add inviter as friend (instant friendship, not just a request)
   */
  const autoAddFriend = async (inviterProfileId: string, userProfileId: string) => {
    try {
      // Check if already friends or request exists
      const { data: existing } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(sender_id.eq.${userProfileId},receiver_id.eq.${inviterProfileId}),and(sender_id.eq.${inviterProfileId},receiver_id.eq.${userProfileId})`)
        .maybeSingle();
      
      if (existing) {
        // If pending, accept it
        if (existing.status === 'pending') {
          await supabase
            .from('friend_requests')
            .update({ status: 'accepted' })
            .eq('id', existing.id);
          console.log('[InvitePopup] Accepted existing friend request');
        } else {
          console.log('[InvitePopup] Already friends');
        }
        return true;
      }
      
      // Create accepted friend request (instant friendship)
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: userProfileId,
          receiver_id: inviterProfileId,
          status: 'accepted',
        });
      
      if (error) {
        console.error('[InvitePopup] Failed to add friend:', error);
        return false;
      }
      
      console.log('[InvitePopup] Added as friends instantly');
      return true;
    } catch (error) {
      console.error('[InvitePopup] Error adding friend:', error);
      return false;
    }
  };

  const handleThankYou = async () => {
    if (!profile?.id || !referral || loading) return;
    
    setLoading(true);
    
    try {
      // Grant reward and notify inviter
      await grantRewardAndNotify(
        referral.inviterUserId,
        referral.inviterId,
        profile.id
      );
      
      // Auto-add as friend (instant friendship)
      await autoAddFriend(referral.inviterId, profile.id);
      
      // Mark as confirmed
      markReferralConfirmed();
      
      // Show success
      setSuccess(true);
      toast.success(`You and @${referral.inviterUsername} are now friends!`);
      
      // Close after animation
      setTimeout(() => {
        setVisible(false);
        cleanupReferralStorage();
      }, 1500);
    } catch (error) {
      console.error('[InvitePopup] Error:', error);
      // Still close on error - don't block user
      markReferralConfirmed();
      setVisible(false);
      cleanupReferralStorage();
    } finally {
      setLoading(false);
    }
  };

  if (!visible || !referral) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop - not dismissible by clicking */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-sm liquid-glass-card rounded-2xl p-8 shadow-xl"
        >
          <div className="text-center space-y-6">
            {success ? (
              // Success animation
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="space-y-4"
              >
                <div className="flex justify-center">
                  <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.2, type: 'spring' }}
                    >
                      <Check className="h-10 w-10 text-green-500" />
                    </motion.div>
                  </div>
                </div>
                <p className="text-lg font-medium">Welcome to VYBE!</p>
              </motion.div>
            ) : (
              <>
                {/* Inviter Avatar with glow */}
                <div className="flex justify-center">
                  <div className="relative">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.5, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="absolute inset-0 rounded-full bg-primary/30 blur-xl"
                    />
                    <Avatar className="h-24 w-24 ring-4 ring-primary/20 relative z-10">
                      <AvatarImage src={referral.inviterAvatarUrl || undefined} />
                      <AvatarFallback className="text-3xl gradient-animated text-white">
                        {referral.inviterUsername?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                </div>
                
                {/* Title */}
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">
                    @{referral.inviterUsername} invited you
                  </h2>
                  <p className="text-muted-foreground text-lg">
                    Thanks for joining VYBE!
                  </p>
                </div>
                
                {/* Single Action Button */}
                <div className="pt-2">
                  <Button
                    className="w-full gradient-animated text-lg py-6"
                    size="lg"
                    onClick={handleThankYou}
                    disabled={loading}
                  >
                    {loading ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <>
                        <Heart className="h-5 w-5 mr-2" />
                        Thank You
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
