import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, UserPlus, X } from 'lucide-react';
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
 * Post-Signup Referral Confirmation Modal
 * 
 * Shows ONLY after account creation is complete:
 * - Title: "You joined using @username's invite"
 * - Body: "Would you like to add them as a friend?"
 * - Buttons: "Add Friend" / "Not Now"
 * 
 * On Add Friend click:
 * - Grant reward to inviter (once)
 * - Send friend request
 * - Send notification to inviter
 * - Close modal permanently
 * 
 * Rules:
 * - Modal shows ONCE
 * - Dismissible via buttons only
 * - Never blocks app if referral fails
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [referral, setReferral] = useState<PendingReferral | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const processedRef = useRef(false);
  const rewardGrantedRef = useRef(false);

  // Check for pending referral after auth is ready
  useEffect(() => {
    // Wait for complete auth state
    if (!user?.id || !profile?.id) return;
    
    // Prevent multiple processing
    if (processedRef.current) return;
    
    const checkPendingReferral = async () => {
      // Already confirmed?
      if (wasReferralConfirmed()) {
        console.log('[InvitePopup] Referral already confirmed');
        cleanupReferralStorage();
        return;
      }
      
      const pending = getPendingReferral();
      if (!pending) {
        console.log('[InvitePopup] No pending referral');
        return;
      }
      
      console.log('[InvitePopup] Found pending referral for:', pending.inviterUsername);
      
      // Prevent self-referral
      if (pending.inviterId === profile.id) {
        console.log('[InvitePopup] Self-referral detected, clearing');
        cleanupReferralStorage();
        return;
      }
      
      // Verify inviter still exists
      const { data: inviterProfile, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .eq('id', pending.inviterId)
        .maybeSingle();
      
      if (error || !inviterProfile) {
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
    };

    // Delay to ensure UI is settled after signup
    const timer = setTimeout(checkPendingReferral, 1500);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id]);

  /**
   * Grant reward to inviter and send notification
   */
  const grantRewardAndNotify = useCallback(async (
    inviterUserId: string, 
    inviterProfileId: string,
    redeemerProfileId: string,
    redeemerUsername: string
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
   * Send friend request to inviter
   */
  const sendFriendRequest = async (inviterProfileId: string, senderProfileId: string) => {
    try {
      // Check if request already exists
      const { data: existing } = await supabase
        .from('friend_requests')
        .select('id')
        .or(`and(sender_id.eq.${senderProfileId},receiver_id.eq.${inviterProfileId}),and(sender_id.eq.${inviterProfileId},receiver_id.eq.${senderProfileId})`)
        .maybeSingle();
      
      if (existing) {
        console.log('[InvitePopup] Friend request already exists');
        return true;
      }
      
      // Create friend request
      const { error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: senderProfileId,
          receiver_id: inviterProfileId,
          status: 'pending',
        });
      
      if (error) {
        console.error('[InvitePopup] Failed to send friend request:', error);
        return false;
      }
      
      console.log('[InvitePopup] Friend request sent');
      return true;
    } catch (error) {
      console.error('[InvitePopup] Error sending friend request:', error);
      return false;
    }
  };

  const handleAddFriend = async () => {
    if (!profile?.id || !referral || loading) return;
    
    setLoading(true);
    
    try {
      // Grant reward and notify inviter
      await grantRewardAndNotify(
        referral.inviterUserId,
        referral.inviterId,
        profile.id,
        profile.username || 'someone'
      );
      
      // Send friend request
      await sendFriendRequest(referral.inviterId, profile.id);
      
      // Mark as confirmed
      markReferralConfirmed();
      
      // Show success
      setSuccess(true);
      toast.success(`Friend request sent to @${referral.inviterUsername}!`);
      
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

  const handleNotNow = async () => {
    if (!profile?.id || !referral || loading) return;
    
    setLoading(true);
    
    try {
      // Still grant reward even if they don't add friend
      await grantRewardAndNotify(
        referral.inviterUserId,
        referral.inviterId,
        profile.id,
        profile.username || 'someone'
      );
      
      // Mark as confirmed
      markReferralConfirmed();
      
      // Close immediately
      setVisible(false);
      cleanupReferralStorage();
    } catch (error) {
      console.error('[InvitePopup] Error:', error);
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
          className="relative w-full max-w-sm liquid-glass-card rounded-2xl p-6 shadow-xl"
        >
          <div className="text-center space-y-5">
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
                {/* Inviter Avatar */}
                <div className="flex justify-center">
                  <Avatar className="h-20 w-20 ring-4 ring-primary/20">
                    <AvatarImage src={referral.inviterAvatarUrl || undefined} />
                    <AvatarFallback className="text-2xl gradient-animated text-white">
                      {referral.inviterUsername?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </div>
                
                {/* Title */}
                <div className="space-y-2">
                  <h2 className="text-xl font-bold">
                    You joined using @{referral.inviterUsername}'s invite
                  </h2>
                  <p className="text-muted-foreground">
                    Would you like to add them as a friend?
                  </p>
                </div>
                
                {/* Action Buttons */}
                <div className="space-y-3 pt-2">
                  <Button
                    className="w-full gradient-animated text-lg py-6"
                    size="lg"
                    onClick={handleAddFriend}
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
                        <UserPlus className="h-5 w-5 mr-2" />
                        Add Friend
                      </>
                    )}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    className="w-full text-muted-foreground"
                    onClick={handleNotNow}
                    disabled={loading}
                  >
                    Not Now
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
