import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

interface Invite {
  id: string;
  invite_code: string;
  inviter_id: string; // This is auth user ID (user_id from auth.users)
  created_at: string;
  expires_at: string | null;
  max_uses: number | null;
  use_count: number;
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
 * Uses user.id (auth user ID) as the inviter_id since invites table has FK to auth.users
 */
export function useMyInvite() {
  const { user } = useAuth();
  
  const query = useQuery({
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
      
      // Create new invite if none exists - never expires, unlimited uses
      const inviteCode = generateInviteCode();
      const { data: newInvite, error } = await supabase
        .from('invites')
        .insert({
          inviter_id: user.id,
          invite_code: inviteCode,
          expires_at: null,
          max_uses: null,
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

  return query;
}

/**
 * Regenerate invite code for the user
 */
export function useRegenerateInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Must be logged in');
      
      // Generate new unique code
      const newCode = generateInviteCode();
      
      // Check if user has an existing invite
      const { data: existingInvite } = await supabase
        .from('invites')
        .select('id')
        .eq('inviter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingInvite) {
        // Update existing invite with new code
        const { data, error } = await supabase
          .from('invites')
          .update({ 
            invite_code: newCode,
            use_count: 0, // Reset use count
            expires_at: null,
            max_uses: null,
          })
          .eq('id', existingInvite.id)
          .select()
          .single();
        
        if (error) throw error;
        return data as Invite;
      } else {
        // Create new invite
        const { data, error } = await supabase
          .from('invites')
          .insert({
            inviter_id: user.id,
            invite_code: newCode,
            expires_at: null,
            max_uses: null,
          })
          .select()
          .single();
        
        if (error) throw error;
        return data as Invite;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-invite'] });
      toast.success('New invite link generated!');
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to regenerate link');
    },
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
          const { data: redeemerProfile } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', r.redeemer_id)
            .single();
          
          return {
            ...r,
            profile: redeemerProfile,
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
 * Uses profile.id as the redeemer_id (for invite_redemptions, follows, friend_requests)
 * But compares against inviter's auth user ID for self-invite check
 */
export function useRedeemInvite() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  
  return useMutation({
    mutationFn: async (inviteCode: string) => {
      if (!profile?.id || !user?.id) throw new Error('Must be logged in');
      
      // Find the invite
      const { data: invite, error: findError } = await supabase
        .from('invites')
        .select('*')
        .eq('invite_code', inviteCode.toUpperCase())
        .single();
      
      if (findError || !invite) {
        throw new Error('Invalid invite code');
      }
      
      // Check if own invite (inviter_id is auth user ID)
      if (invite.inviter_id === user.id) {
        throw new Error('You cannot use your own invite');
      }
      
      // Check if already redeemed by this profile
      const { data: existing } = await supabase
        .from('invite_redemptions')
        .select('id')
        .eq('invite_id', invite.id)
        .eq('redeemer_id', profile.id)
        .maybeSingle();
      
      if (existing) {
        throw new Error('You have already used this invite');
      }
      
      // Get inviter's profile ID for follows/friend requests
      const { data: inviterProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', invite.inviter_id)
        .single();
      
      if (!inviterProfile) {
        throw new Error('Inviter not found');
      }
      
      // Redeem the invite
      const { error: redeemError } = await supabase
        .from('invite_redemptions')
        .insert({
          invite_id: invite.id,
          redeemer_id: profile.id,
        });
      
      if (redeemError) throw redeemError;
      
      // Update use count
      await supabase
        .from('invites')
        .update({ use_count: (invite.use_count || 0) + 1 })
        .eq('id', invite.id);
      
      // Auto-follow the inviter (use profile IDs)
      try {
        await supabase
          .from('follows')
          .insert({
            follower_id: profile.id,
            following_id: inviterProfile.id,
          });
      } catch {
        // Ignore duplicate errors
      }
      
      // Send friend request (use profile IDs)
      try {
        await supabase
          .from('friend_requests')
          .insert({
            sender_id: profile.id,
            receiver_id: inviterProfile.id,
            status: 'pending',
          });
      } catch {
        // Ignore duplicate errors
      }
      
      analytics.inviteAccepted({ inviterId: invite.inviter_id });
      
      return { inviterId: invite.inviter_id, inviterProfileId: inviterProfile.id };
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
 * Get invite URL - uses username-based format for cleaner links
 */
export function getInviteUrl(username: string): string {
  return `https://www.vybehub.app/invite/@${username}`;
}