import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

interface Invite {
  id: string;
  invite_code: string;
  inviter_id: string;
  created_at: string;
  expires_at: string | null;
  max_uses: number;
  use_count: number;
}

interface InviteRedemption {
  id: string;
  invite_id: string;
  redeemer_id: string;
  redeemed_at: string;
}

interface Badge {
  id: string;
  user_id: string;
  badge_type: string;
  badge_name: string;
  earned_at: string;
  metadata: Record<string, any>;
}

// Generate a unique invite code
function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

/**
 * Get or create the user's invite link
 */
export function useMyInvite() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['my-invite', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Check for existing invite
      const { data: existingInvite } = await supabase
        .from('invites')
        .select('*')
        .eq('inviter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingInvite) {
        return existingInvite as Invite;
      }
      
      // Create new invite if none exists - no expiration by default
      const inviteCode = generateInviteCode();
      const { data: newInvite, error } = await supabase
        .from('invites')
        .insert({
          inviter_id: user.id,
          invite_code: inviteCode,
          expires_at: null, // Never expires
          max_uses: null, // Unlimited uses
        })
        .select()
        .single();
      
      if (error) throw error;
      
      analytics.inviteLinkCreated();
      return newInvite as Invite;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Get invite stats (redemptions count)
 */
export function useInviteStats() {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['invite-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalRedemptions: 0, recentRedemptions: [] };
      
      // Get all invites by this user
      const { data: invites } = await supabase
        .from('invites')
        .select('id')
        .eq('inviter_id', user.id);
      
      if (!invites?.length) return { totalRedemptions: 0, recentRedemptions: [] };
      
      const inviteIds = invites.map(i => i.id);
      
      // Get redemption count
      const { count } = await supabase
        .from('invite_redemptions')
        .select('*', { count: 'exact', head: true })
        .in('invite_id', inviteIds);
      
      // Get recent redemptions with profiles
      const { data: recentRedemptions } = await supabase
        .from('invite_redemptions')
        .select(`
          id,
          redeemed_at,
          redeemer_id
        `)
        .in('invite_id', inviteIds)
        .order('redeemed_at', { ascending: false })
        .limit(10);
      
      // Fetch profiles for redeemers
      const redemptionsWithProfiles = await Promise.all(
        (recentRedemptions || []).map(async (r) => {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', r.redeemer_id)
            .single();
          
          return {
            ...r,
            profile,
          };
        })
      );
      
      return {
        totalRedemptions: count || 0,
        recentRedemptions: redemptionsWithProfiles,
      };
    },
    enabled: !!user?.id,
  });
}

/**
 * Redeem an invite code
 */
export function useRedeemInvite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!user?.id) throw new Error('Must be logged in');
      
      // Find the invite
      const { data: invite, error: findError } = await supabase
        .from('invites')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();
      
      if (findError || !invite) {
        throw new Error('Invalid invite code');
      }
      
      // Check if already redeemed
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('invite_id', invite.id)
        .eq('redeemer_id', user.id)
        .single();
      
      if (existing) {
        throw new Error('You have already used this invite');
      }
      
      // Check if own invite
      if (invite.inviter_id === user.id) {
        throw new Error('You cannot use your own invite');
      }
      
      // Redeem the invite
      const { error: redeemError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: invite.id,
          redeemer_id: user.id,
        });
      
      if (redeemError) throw redeemError;
      
      // Update use count
      await supabase
        .from('invites')
        .update({ use_count: (invite.use_count || 0) + 1 })
        .eq('id', invite.id);
      
      // Auto-follow the inviter
      await supabase
        .from('follows')
        .insert({
          follower_id: user.id,
          following_id: invite.inviter_id,
        });
      
      // Send friend request
      await supabase
        .from('friend_requests')
        .insert({
          sender_id: user.id,
          receiver_id: invite.inviter_id,
          status: 'pending',
        });
      
      analytics.inviteAccepted({ inviterId: invite.inviter_id });
      
      return { inviterId: invite.inviter_id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-stats'] });
      toast.success('Invite accepted! You are now connected.');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to redeem invite');
    },
  });
}

/**
 * Get user's badges
 */
export function useUserBadges(userId?: string) {
  const { profile } = useAuth();
  const targetUserId = userId || profile?.id;
  
  return useQuery({
    queryKey: ['user-badges', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      
      const { data, error } = await supabase
        .from('user_badges')
        .select('*')
        .eq('user_id', targetUserId)
        .order('earned_at', { ascending: false });
      
      if (error) throw error;
      return data as Badge[];
    },
    enabled: !!targetUserId,
  });
}

/**
 * Get invite URL - uses official vybehub.app domain
 */
export function getInviteUrl(inviteCode: string): string {
  // Use official domain for production invite links
  return `https://vybehub.app/invite/${inviteCode}`;
}
