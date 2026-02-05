import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface UserLevel {
  id: string;
  user_id: string;
  total_xp: number;
  current_level: number;
  unclaimed_rewards: VybePassReward[];
  created_at: string;
  updated_at: string;
}

export interface VybePassTier {
  id: string;
  level: number;
  xp_required: number;
  reward_type: 'badge' | 'cosmetic' | 'effect' | 'title';
  reward_id: string | null;
  reward_name: string;
  reward_description: string | null;
  reward_icon: string;
  is_premium: boolean;
}

export interface VybePassReward {
  level: number;
  reward_type: string;
  reward_id: string | null;
  reward_name: string;
  reward_icon: string;
}

export interface ChallengeReward {
  id: string;
  user_id: string;
  challenge_id: string;
  xp_amount: number;
  badge_id: string | null;
  is_claimed: boolean;
  claimed_at: string | null;
  created_at: string;
  challenge?: {
    title: string;
    description: string | null;
  };
}

/**
 * Fetch user's level and XP
 */
export function useUserLevel() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-level', profile?.user_id],
    queryFn: async () => {
      // user_levels.user_id references auth.users.id, so we use profile.user_id
      if (!profile?.user_id) return null;
      
      const { data, error } = await supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      
      if (error) throw error;
      
      // If no record exists, create one
      if (!data) {
        const { data: newData, error: insertError } = await supabase
          .from('user_levels')
          .insert({ user_id: profile.user_id })
          .select()
          .single();
        
        if (insertError) throw insertError;
        return {
          ...newData,
          unclaimed_rewards: (Array.isArray(newData.unclaimed_rewards) ? newData.unclaimed_rewards : []) as unknown as VybePassReward[],
        } as UserLevel;
      }
      
      return {
        ...data,
        unclaimed_rewards: (Array.isArray(data.unclaimed_rewards) ? data.unclaimed_rewards : []) as unknown as VybePassReward[],
      } as UserLevel;
    },
    enabled: !!profile?.user_id,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Fetch all VYBE Pass tiers
 */
export function useVybePassTiers() {
  return useQuery({
    queryKey: ['vybe-pass-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('battle_pass_tiers')
        .select('*')
        .order('level', { ascending: true });
      
      if (error) throw error;
      return data as VybePassTier[];
    },
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Fetch unclaimed challenge rewards
 */
export function useUnclaimedRewards() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unclaimed-rewards', profile?.user_id],
    queryFn: async () => {
      // challenge_rewards.user_id references auth.users.id, so we use profile.user_id
      if (!profile?.user_id) return [];
      
      const { data, error } = await supabase
        .from('challenge_rewards')
        .select(`
          *,
          challenge:challenges(title, description)
        `)
        .eq('user_id', profile.user_id)
        .eq('is_claimed', false)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ChallengeReward[];
    },
    enabled: !!profile?.user_id,
    staleTime: 1000 * 30,
  });
}

/**
 * Claim a challenge reward
 */
export function useClaimReward() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      // claim_challenge_reward expects profile.id (it translates internally)
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.rpc('claim_challenge_reward', {
        p_user_id: profile.id,
        p_reward_id: rewardId,
      });
      
      if (error) throw error;
      
      const result = data as unknown as {
        success: boolean;
        xp_gained: number;
        level_result: {
          old_level: number;
          new_level: number;
          total_xp: number;
          level_up: boolean;
          new_rewards: VybePassReward[];
        };
      };
      
      return result;
    },
    onSuccess: (data) => {
      // Invalidate using auth ID
      queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['user-level', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.user_id] });
      
      if (data.level_result?.level_up) {
        toast.success(`🎉 Level Up! You're now level ${data.level_result.new_level}!`, {
          duration: 5000,
        });
      }
    },
  });
}

/**
 * Real-time subscription for new challenge rewards
 */
export function useRealtimeChallengeRewards(onNewReward?: (reward: ChallengeReward) => void) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const callbackRef = useRef(onNewReward);
  callbackRef.current = onNewReward;

  useEffect(() => {
    // challenge_rewards.user_id is auth ID
    if (!profile?.user_id) return;

    const channel = supabase
      .channel(`challenge-rewards-${profile.user_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'challenge_rewards',
          filter: `user_id=eq.${profile.user_id}`,
        },
        async (payload) => {
          if (import.meta.env.DEV) {
            console.log('[VybePass] New reward received:', payload);
          }
          
          // Fetch the full reward with challenge info
          const { data: reward } = await supabase
            .from('challenge_rewards')
            .select(`*, challenge:challenges(title, description)`)
            .eq('id', payload.new.id)
            .single();
          
          if (reward) {
            queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile.user_id] });
            callbackRef.current?.(reward as ChallengeReward);
            
            // Show toast notification
            toast.success(
              `🎯 Challenge Complete! Claim your ${reward.xp_amount} XP reward!`,
              {
                duration: 8000,
                action: {
                  label: 'Claim',
                  onClick: () => {
                    window.location.href = '/challenges';
                  },
                },
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, queryClient]);
}

/**
 * Real-time subscription for level updates
 */
export function useRealtimeLevelUpdates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // user_levels.user_id is auth ID
    if (!profile?.user_id) return;

    const channel = supabase
      .channel(`user-level-${profile.user_id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_levels',
          filter: `user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          if (import.meta.env.DEV) {
            console.log('[VybePass] Level updated:', payload);
          }
          queryClient.invalidateQueries({ queryKey: ['user-level', profile.user_id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, queryClient]);
}

/**
 * Real-time subscription for challenge progress updates
 */
export function useRealtimeChallengeProgress() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    // challenge_progress.user_id is profile.id (not auth ID)
    if (!profile?.id) return;

    const channel = supabase
      .channel(`challenge-progress-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_progress',
          filter: `user_id=eq.${profile.id}`,
        },
        (payload) => {
          if (import.meta.env.DEV) {
            console.log('[VybePass] Challenge progress updated:', payload);
          }
          // Invalidate queries to refresh UI
          queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

/**
 * Calculate XP needed for next level
 */
export function useNextLevelProgress() {
  const { data: userLevel } = useUserLevel();
  const { data: tiers } = useVybePassTiers();

  if (!userLevel || !tiers) {
    return {
      currentXP: 0,
      currentLevel: 1,
      nextLevelXP: 100,
      progressPercent: 0,
      xpToNextLevel: 100,
    };
  }

  const currentTier = tiers.find(t => t.level === userLevel.current_level);
  const nextTier = tiers.find(t => t.level === userLevel.current_level + 1);
  
  const currentLevelXP = currentTier?.xp_required || 0;
  const nextLevelXP = nextTier?.xp_required || currentLevelXP + 500;
  
  const xpInCurrentLevel = userLevel.total_xp - currentLevelXP;
  const xpNeededForLevel = nextLevelXP - currentLevelXP;
  const progressPercent = Math.min(100, (xpInCurrentLevel / xpNeededForLevel) * 100);

  return {
    currentXP: userLevel.total_xp,
    currentLevel: userLevel.current_level,
    nextLevelXP,
    progressPercent,
    xpToNextLevel: nextLevelXP - userLevel.total_xp,
  };
}

/**
 * Grant XP for content creation (posts, clips, stories, snaps)
 */
export function useGrantPostXP() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (contentType: string = 'post') => {
      // grant_post_xp expects profile.id (it translates internally)
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.rpc('grant_post_xp', {
        p_user_id: profile.id,
        p_content_type: contentType,
      });
      
      if (error) throw error;
      return data as { success: boolean; xp_granted: number; content_type: string; level_result: any };
    },
    onSuccess: (data) => {
      // Invalidate using auth ID for user_levels
      queryClient.invalidateQueries({ queryKey: ['user-level', profile?.user_id] });
      
      // Show XP toast
      toast.success(`+${data.xp_granted} XP for your ${data.content_type}!`, {
        duration: 3000,
      });
      
      if (data.level_result?.level_up) {
        toast.success(`🎉 Level Up! You're now level ${data.level_result.new_level}!`, {
          duration: 5000,
        });
      }
    },
  });
}
