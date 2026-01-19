import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import {
  getPendingReferral,
  clearPendingReferral,
  markPopupShown,
  wasPopupShown,
} from '@/lib/referral';

interface InviterInfo {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
}

/**
 * Post-signup popup that asks user if they want to add their inviter as friend.
 * 
 * Flow:
 * 1. User visits invite link → inviter ID stored in localStorage
 * 2. User signs up and completes onboarding
 * 3. This component detects the pending referral and shows modal
 * 4. User can add friend or dismiss
 * 5. Inviter reward is granted regardless of friend choice
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [processed, setProcessed] = useState(false);

  // Process pending referral when user is authenticated
  useEffect(() => {
    // Wait for full auth to be ready
    if (!user?.id || !profile?.id) return;
    
    // Don't process more than once per session
    if (processed) return;

    const processPendingReferral = async () => {
      const pendingInviterId = getPendingReferral();
      
      // No pending referral
      if (!pendingInviterId) {
        console.log('[InvitePopup] No pending referral found');
        return;
      }
      
      console.log('[InvitePopup] Found pending referral:', pendingInviterId);
      
      // Already shown the popup for this referral
      if (wasPopupShown()) {
        console.log('[InvitePopup] Popup already shown, clearing');
        clearPendingReferral();
        return;
      }
      
      // Don't allow self-referral
      if (pendingInviterId === profile.id) {
        console.log('[InvitePopup] Self-referral, clearing');
        clearPendingReferral();
        return;
      }
      
      try {
        // Validate inviter exists - use public_profiles for RLS compatibility
        const { data: inviterProfile, error } = await supabase
          .from('public_profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', pendingInviterId)
          .maybeSingle();
        
        if (error || !inviterProfile) {
          console.log('[InvitePopup] Inviter not found, clearing referral');
          clearPendingReferral();
          return;
        }
        
        console.log('[InvitePopup] Showing popup for inviter:', inviterProfile.username);
        
        // Show the popup
        setInviter(inviterProfile);
        setVisible(true);
        setProcessed(true);
      } catch (err) {
        console.error('[InvitePopup] Error processing referral:', err);
        clearPendingReferral();
      }
    };

    // Small delay to ensure UI is settled and auth is fully ready
    const timer = setTimeout(processPendingReferral, 1000);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id, processed]);

  // Grant reward to inviter (called once per new user)
  const grantInviterReward = useCallback(async (inviterId: string, redeemerId: string) => {
    try {
      // Check if already redeemed by this user
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('redeemer_id', redeemerId)
        .maybeSingle();
      
      if (existing) {
        console.log('Invite already redeemed by this user');
        return;
      }
      
      // Get inviter's user_id from their profile to find their invite
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', inviterId)
        .single();
      
      if (!inviterProfile?.user_id) {
        console.log('Could not find inviter user_id');
        return;
      }
      
      // Find the inviter's invite record
      const { data: invite } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', inviterProfile.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!invite) {
        console.log('No invite found for inviter');
        return;
      }
      
      // Create redemption record
      const { error: redemptionError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: invite.id,
          redeemer_id: redeemerId,
        });
      
      if (redemptionError) {
        console.error('Failed to create redemption:', redemptionError);
        return;
      }
      
      // Increment use count
      await supabase
        .from('invites')
        .update({ use_count: (invite.use_count || 0) + 1 })
        .eq('id', invite.id);
      
      console.log('Inviter reward granted successfully');
    } catch (error) {
      console.error('Failed to grant inviter reward:', error);
      // Don't block user flow on reward failure
    }
  }, []);

  const handleAddFriend = async () => {
    if (!profile?.id || !inviter?.id) return;
    
    setLoading(true);
    
    try {
      // Check for existing friend request in either direction
      const { data: existingRequest } = await supabase
        .from('friend_requests')
        .select('id, status')
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${inviter.id}),and(sender_id.eq.${inviter.id},receiver_id.eq.${profile.id})`)
        .maybeSingle();
      
      if (!existingRequest) {
        // Send new friend request
        await supabase
          .from('friend_requests')
          .insert({
            sender_id: profile.id,
            receiver_id: inviter.id,
            status: 'pending',
          });
      }
      
      // Also follow the inviter
      await supabase
        .from('follows')
        .upsert({
          follower_id: profile.id,
          following_id: inviter.id,
        }, { onConflict: 'follower_id,following_id' });
      
      // Grant reward to inviter
      await grantInviterReward(inviter.id, profile.id);
      
      toast.success(`Friend request sent to @${inviter.username}!`);
      handleClose();
    } catch (error: any) {
      console.error('Failed to add friend:', error);
      // Still close and grant reward even if friend request fails
      await grantInviterReward(inviter.id, profile.id);
      handleClose();
    } finally {
      setLoading(false);
    }
  };

  const handleNotNow = async () => {
    if (profile?.id && inviter?.id) {
      // Grant reward even if user doesn't add as friend
      await grantInviterReward(inviter.id, profile.id);
    }
    handleClose();
  };

  const handleClose = () => {
    setVisible(false);
    markPopupShown();
    clearPendingReferral();
  };

  if (!visible || !inviter) return null;

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
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
          
          {/* Content */}
          <div className="text-center space-y-4">
            {/* Avatar */}
            <div className="flex justify-center">
              <Avatar className="h-20 w-20 ring-4 ring-primary/20">
                <AvatarImage src={inviter.avatar_url || undefined} />
                <AvatarFallback className="text-2xl gradient-animated text-white">
                  {inviter.username?.[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            
            {/* Title */}
            <div>
              <h2 className="text-xl font-bold">
                You joined using @{inviter.username}'s invite
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
                <UserPlus className="h-4 w-4 mr-2" />
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
