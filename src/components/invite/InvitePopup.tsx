import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

interface InviterInfo {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
}

/**
 * Post-signup popup that asks user if they want to add their inviter as friend
 * Only shows once after signup if there was a pending invite
 */
export function InvitePopup() {
  const { user, profile } = useAuth();
  const [inviter, setInviter] = useState<InviterInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only check after user has signed up and has a profile
    if (!user?.id || !profile?.id) return;

    const checkPendingInvite = async () => {
      const pendingInviterId = sessionStorage.getItem('pending_inviter_id');
      const popupShown = sessionStorage.getItem('invite_popup_shown');
      
      // Don't show if already shown or no pending invite
      if (!pendingInviterId || popupShown === 'true') return;
      
      // Don't invite yourself
      if (pendingInviterId === profile.id) {
        sessionStorage.removeItem('pending_inviter_id');
        return;
      }
      
      try {
        // Fetch inviter profile
        const { data: inviterProfile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', pendingInviterId)
          .single();
        
        if (inviterProfile) {
          setInviter(inviterProfile);
          setVisible(true);
        }
      } catch {
        // Inviter not found, clear storage
        sessionStorage.removeItem('pending_inviter_id');
      }
    };

    // Small delay to let the UI settle after signup
    const timer = setTimeout(checkPendingInvite, 1000);
    return () => clearTimeout(timer);
  }, [user?.id, profile?.id]);

  const handleAddFriend = async () => {
    if (!profile?.id || !inviter?.id) return;
    
    setLoading(true);
    
    try {
      // Send friend request to inviter
      const { error: friendError } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: profile.id,
          receiver_id: inviter.id,
          status: 'pending',
        });
      
      if (friendError && !friendError.message.includes('duplicate')) {
        throw friendError;
      }
      
      // Also follow the inviter
      try {
        await supabase
          .from('follows')
          .insert({
            follower_id: profile.id,
            following_id: inviter.id,
          });
      } catch {
        // Ignore duplicate
      }
      
      // Mark invite as redeemed (grant reward to inviter)
      await grantInviterReward(inviter.id, profile.id);
      
      toast.success(`Friend request sent to @${inviter.username}!`);
      handleClose();
    } catch (error) {
      console.error('Failed to add friend:', error);
      toast.error('Failed to send friend request');
    } finally {
      setLoading(false);
    }
  };

  const handleNotNow = async () => {
    if (!profile?.id || !inviter?.id) {
      handleClose();
      return;
    }
    
    // Still grant inviter reward even if user doesn't add as friend
    await grantInviterReward(inviter.id, profile.id);
    handleClose();
  };

  const handleClose = () => {
    setVisible(false);
    sessionStorage.setItem('invite_popup_shown', 'true');
    sessionStorage.removeItem('pending_inviter_id');
  };

  // Grant reward to inviter (called once per new user)
  const grantInviterReward = async (inviterId: string, redeemerId: string) => {
    try {
      // Check if already redeemed
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('redeemer_id', redeemerId)
        .maybeSingle();
      
      if (existing) {
        console.log('Invite already redeemed');
        return;
      }
      
      // Find the inviter's invite
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('id', inviterId)
        .single();
      
      if (!inviterProfile) return;
      
      const { data: invite } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', inviterProfile.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!invite) return;
      
      // Create redemption record (grants reward via trigger)
      await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: invite.id,
          redeemer_id: redeemerId,
        });
      
      // Increment use count
      await supabase
        .from('invites')
        .update({ use_count: (invite.use_count || 0) + 1 })
        .eq('id', invite.id);
      
      console.log('Inviter reward granted');
    } catch (error) {
      console.error('Failed to grant inviter reward:', error);
      // Don't block user flow on reward failure
    }
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
                You used @{inviter.username}'s invite
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
