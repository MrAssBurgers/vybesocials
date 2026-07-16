import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthOptional } from '@/lib/auth';
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
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  
  const query = useQuery({
    queryKey: ['my-invite', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      
      // Check for existing invite
      const { data: existingInvite } = await db
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
      const { data: newInvite, error } = await db
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
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Must be logged in');
      
      // Generate new unique code
      const newCode = generateInviteCode();
      
      // Check if user has an existing invite
      const { data: existingInvite } = await db
        .from('invites')
        .select('id')
        .eq('inviter_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (existingInvite) {
        // Update existing invite with new code
        const { data, error } = await db
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
        const { data, error } = await db
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
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const queryClient = useQueryClient();
  const awardedMilestonesRef = useRef<Set<number>>(new Set());
  
  const query = useQuery({
    queryKey: ['invite-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return { totalRedemptions: 0, recentRedemptions: [] };
      
      // Get all invites by this user
      const { data: invites } = await db
        .from('invites')
        .select('id, use_count')
        .eq('inviter_id', user.id);
      
      if (!invites?.length) return { totalRedemptions: 0, recentRedemptions: [] };
      
      // Sum up use_count from all invites (more reliable than counting redemptions)
      const totalFromInvites = invites.reduce((sum, inv) => sum + (inv.use_count || 0), 0);
      
      const inviteIds = invites.map(i => i.id);
      
      // Get redemption count as backup
      const { count } = await db
        .from('invite_redemptions')
        .select('*', { count: 'exact', head: true })
        .in('invite_id', inviteIds);
      
      // Use whichever is higher (handles edge cases)
      const totalRedemptions = Math.max(totalFromInvites, count || 0);
      
      // Get recent redemptions with profiles
      const { data: recentRedemptions } = await db
        .from('invite_redemptions')
        .select(`
          id,
          redeemed_at,
          redeemer_id
        `)
        .in('invite_id', inviteIds)
        .order('redeemed_at', { ascending: false })
        .limit(10);
      
      // Fetch all redeemer profiles in a single batched query (was N+1)
      const redeemerIds = [...new Set((recentRedemptions || []).map(r => r.redeemer_id))];
      const { data: redeemerProfiles } = redeemerIds.length
        ? await db
            .from('profiles')
            .select('user_id, username, avatar_url')
            .in('user_id', redeemerIds)
        : { data: [] as { user_id: string; username: string | null; avatar_url: string | null }[] };
      const profileById = new Map((redeemerProfiles || []).map(p => [p.user_id, p]));

      const redemptionsWithProfiles = (recentRedemptions || []).map(r => ({
        ...r,
        profile: profileById.get(r.redeemer_id) || null,
      }));
      
      return {
        totalRedemptions,
        recentRedemptions: redemptionsWithProfiles,
      };
    },
    enabled: !!user?.id,
    // Poll at a sane rate — 1s polling was hammering the API (~13 req/s with the N+1 profiles)
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  // Award badges when milestones are reached
  useEffect(() => {
    const awardBadgeForMilestone = async (milestone: number, badgeName: string) => {
      if (!user?.id || awardedMilestonesRef.current.has(milestone)) return;

      try {
        // Server-validated badge award (counts real redemptions; idempotent)
        const { data, error } = await db.rpc('award_invite_badge', {
          p_milestone: milestone,
        });

        if (error) {
          console.error('Failed to award badge:', error);
          return;
        }

        awardedMilestonesRef.current.add(milestone);
        const result = data as { ok?: boolean; awarded?: string; already_awarded?: boolean } | null;
        if (result?.awarded) {
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
  const auth = useAuthOptional();
  const user = auth?.user ?? null;
  const targetUserId = userId || user?.id;
  
  return useQuery({
    queryKey: ['user-badges', targetUserId],
    queryFn: async () => {
      if (!targetUserId) return [];
      
      const { data, error } = await db
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
