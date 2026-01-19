import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X, Loader2, Check } from 'lucide-react';
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
  const [success, setSuccess] = useState(false);
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
      
      // Don't allow self-referral - compare profile IDs
      if (pending.inviterId === profile.id) {
        console.log('[InvitePopup] Self-referral, clearing');
        cleanupReferralStorage();
        return;
      }
      
      // Verify inviter still exists and get their user_id for invite lookup
      const { data: inviterProfile, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, avatar_url, display_name')
        .eq('id', pending.inviterId)
        .maybeSingle();
      
      if (error || !inviterProfile) {
        console.log('[InvitePopup] Inviter no longer exists, clearing');
        cleanupReferralStorage();
        return;
      }
      
      // Update referral with fresh data including user_id
      const freshReferral: PendingReferral & { inviterUserId?: string } = {
        inviterId: inviterProfile.id,
        inviterUsername: inviterProfile.username,
        inviterDisplayName: inviterProfile.display_name,
        inviterAvatarUrl: inviterProfile.avatar_url,
        timestamp: pending.timestamp,
      };
      
      // Store the auth user_id for reward lookup
      (freshReferral as any).inviterUserId = inviterProfile.user_id;
      
      setReferral(freshReferral);
      setVisible(true);
      processedRef.current = true;
      
      console.log('[InvitePopup] Showing popup for:', inviterProfile.username, 'with user_id:', inviterProfile.user_id);
    };

    // Delay to ensure UI is settled and auth is fully ready
    const timer = setTimeout(processPendingReferral, 800);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id]);

  /**
   * Grant reward to inviter - happens ONCE per new user
   * Uses invite_redemptions table to prevent duplicates
   * IMPORTANT: Uses auth user_id (not profile.id) for invite lookup
   */
  const grantInviterReward = useCallback(async (inviterUserId: string, redeemerProfileId: string) => {
    // Prevent duplicate calls in same session
    if (rewardGrantedRef.current) {
      console.log('[InvitePopup] Reward already granted this session');
      return true;
    }
    
    // Check local flag first (quick check)
    if (wasReferralConsumed()) {
      console.log('[InvitePopup] Referral already consumed (local)');
      return true;
    }
    
    try {
      console.log('[InvitePopup] Granting reward - inviterUserId:', inviterUserId, 'redeemerProfileId:', redeemerProfileId);
      
      // Check if this user already has a redemption (server-side dedup)
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('redeemer_id', redeemerProfileId)
        .maybeSingle();
      
      if (existing) {
        console.log('[InvitePopup] User already redeemed an invite');
        markReferralConsumed();
        return true;
      }
      
      // Find the inviter's invite record using their auth user_id
      const { data: existingInvite } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', inviterUserId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      let inviteId: string;
      let currentUseCount: number = 0;
      
      if (!existingInvite) {
        // Create an invite record for the inviter if they don't have one
        console.log('[InvitePopup] Creating new invite for inviter');
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
          console.log('[InvitePopup] Could not create invite for inviter:', createError);
          return false;
        }
        inviteId = newInvite.id;
        currentUseCount = newInvite.use_count || 0;
      } else {
        inviteId = existingInvite.id;
        currentUseCount = existingInvite.use_count || 0;
        console.log('[InvitePopup] Found existing invite:', inviteId, 'current count:', currentUseCount);
      }
      
      // Create redemption record
      const { error: redemptionError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: inviteId,
          redeemer_id: redeemerProfileId,
        });
      
      if (redemptionError) {
        // Unique constraint violation = already redeemed
        if (redemptionError.code === '23505') {
          console.log('[InvitePopup] Redemption already exists');
          markReferralConsumed();
          return true;
        }
        console.error('[InvitePopup] Failed to create redemption:', redemptionError);
        return false;
      }
      
      // Increment use count
      const { error: updateError } = await supabase
        .from('invites')
        .update({ use_count: currentUseCount + 1 })
        .eq('id', inviteId);
      
      if (updateError) {
        console.error('[InvitePopup] Failed to update use_count:', updateError);
      } else {
        console.log('[InvitePopup] Updated use_count to:', currentUseCount + 1);
      }
      
      // Mark as consumed
      markReferralConsumed();
      rewardGrantedRef.current = true;
      
      console.log('[InvitePopup] Inviter reward granted successfully!');
      return true;
    } catch (error) {
      console.error('[InvitePopup] Error granting reward:', error);
      return false;
    }
  }, []);

  const handleAddFriend = async () => {
    if (!profile?.id || !referral || !user?.id) return;
    
    setLoading(true);
    
    try {
      // Get the inviter's auth user_id from the referral
      const inviterUserId = (referral as any).inviterUserId;
      
      if (!inviterUserId) {
        // Fallback: look up the user_id from profiles
        const { data: inviterProfile } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('id', referral.inviterId)
          .single();
        
        if (inviterProfile?.user_id) {
          (referral as any).inviterUserId = inviterProfile.user_id;
        }
      }
      
      // Grant reward to inviter FIRST using their auth user_id
      const rewardSuccess = await grantInviterReward(
        (referral as any).inviterUserId || referral.inviterId, 
        profile.id
      );
      
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
          console.log('[InvitePopup] Friend request sent');
        }
      }
      
      // Also follow the inviter
      await supabase
        .from('follows')
        .upsert({
          follower_id: profile.id,
          following_id: referral.inviterId,
        }, { onConflict: 'follower_id,following_id' });
      
      // Show success state
      setSuccess(true);
      toast.success(`You're now connected with @${referral.inviterUsername}!`);
      
      // Close after showing success
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (error: any) {
      console.error('[InvitePopup] Failed to add friend:', error);
      toast.error('Something went wrong');
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  const handleNotNow = async () => {
    if (profile?.id && referral) {
      // Get the inviter's auth user_id
      const inviterUserId = (referral as any).inviterUserId;
      if (inviterUserId) {
        // Grant reward even if user doesn't add as friend
        await grantInviterReward(inviterUserId, profile.id);
      }
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
          onClick={!loading && !success ? handleNotNow : undefined}
        />
        
        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-sm liquid-glass-card rounded-2xl p-6 shadow-xl"
        >
          {/* Close button */}
          {!success && (
            <button
              onClick={handleNotNow}
              className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted/50 transition-colors"
              disabled={loading}
            >
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
          
          {/* Content */}
          <div className="text-center space-y-4">
            {success ? (
              // Success state with checkmark
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
                <div>
                  <h2 className="text-xl font-bold text-green-500">Success!</h2>
                  <p className="text-muted-foreground mt-2">
                    Connected with @{referral.inviterUsername}
                  </p>
                </div>
              </motion.div>
            ) : (
              <>
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
                    Accept & Add Friend
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
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
