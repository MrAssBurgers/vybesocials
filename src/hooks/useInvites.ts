import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';
import { useEffect, useRef } from 'react';

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
 * Refetches frequently to show new redemptions quickly
 * Also automatically awards badges for milestones
 */
export function useInviteStats() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const awardedMilestonesRef = useRef<Set<number>>(new Set());
  
  const query = useQuery({
    queryKey: ['invite-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalRedemptions: 0, recentRedemptions: [] };
      
      // Get all invites by this user
      const { data: invites } = await supabase
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', user.id);
      
      if (!invites?.length) return { totalRedemptions: 0, recentRedemptions: [] };
      
      // Sum up use_count from all invites (more reliable than counting redemptions)
      const totalFromInvites = invites.reduce((sum, inv) => sum + (inv.use_count || 0), 0);
      
      const inviteIds = invites.map(i => i.id);
      
      // Get redemption count as backup
      const { count } = await supabase
        .from('invite_redemptions')
        .select('*', { count: 'exact', head: true })
        .in('invite_id', inviteIds);
      
      // Use whichever is higher (handles edge cases)
      const totalRedemptions = Math.max(totalFromInvites, count || 0);
      
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
            .eq('user_id', r.redeemer_id)
            .single();
          
          return {
            ...r,
            profile: redeemerProfile,
          };
        })
      );
      
      return {
        totalRedemptions,
        recentRedemptions: redemptionsWithProfiles,
      };
    },
    enabled: !!user?.id,
    // Refetch frequently so inviter progress feels instant
    refetchInterval: 1000,
    staleTime: 0,
  });

  // Award badges when milestones are reached
  useEffect(() => {
    const awardBadgeForMilestone = async (milestone: number, badgeName: string) => {
      if (!user?.id || awardedMilestonesRef.current.has(milestone)) return;
      
      try {
        // Check if user already has this badge
        const { data: existingBadge } = await supabase
          .from('user_badges')
          .select('id')
          .eq('user_id', user.id)
          .eq('badge_type', `invite_${milestone}`)
          .maybeSingle();
        
        if (existingBadge) {
          awardedMilestonesRef.current.add(milestone);
          return;
        }
        
        // Award the badge
        const { error } = await supabase
          .from('user_badges')
          .insert({
            user_id: user.id,
            badge_type: `invite_${milestone}`,
            badge_name: badgeName,
            metadata: { invites: milestone },
          });
        
        if (!error) {
          awardedMilestonesRef.current.add(milestone);
          toast.success(`🎖️ Badge unlocked: ${badgeName}!`);
          queryClient.invalidateQueries({ queryKey: ['user-badges'] });
        }
      } catch (err) {
        console.error('Failed to award badge:', err);
      }
    };

    const total = query.data?.totalRedemptions || 0;
    
    // Check milestones and award badges
    if (total >= 1) awardBadgeForMilestone(1, 'First Invite');
    if (total >= 3) awardBadgeForMilestone(3, 'Rising Star');
    if (total >= 10) awardBadgeForMilestone(10, 'Early Builder');
  }, [query.data?.totalRedemptions, user?.id, queryClient]);

  return query;
}

/**
 * Get user's badges
 */
export function useUserBadges(userId?: string) {
  const { user } = useAuth();
  const targetUserId = userId || user?.id;
  
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
  const baseUrl = 'https://vybehub.app';
  return `${baseUrl}/invite/@${username}`;
}
