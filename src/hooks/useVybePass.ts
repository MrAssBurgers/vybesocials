import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { navigationRef } from '@/lib/navigationRef';

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

export function useUserLevel() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-level', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return null;
      
      const { data, error } = await supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      
      if (error) throw error;
      
      if (!data) {
        try {
          await supabase.rpc('ensure_user_level');
          const { data: retryData } = await supabase
            .from('user_levels')
            .select('*')
            .eq('user_id', profile.user_id)
            .maybeSingle();
          if (retryData) {
            return {
              ...retryData,
              unclaimed_rewards: (Array.isArray(retryData.unclaimed_rewards) ? retryData.unclaimed_rewards : []) as unknown as VybePassReward[],
            } as UserLevel;
          }
          return null;
        } catch (e) {
          console.warn('[VybePass] ensure_user_level failed:', e);
          return null;
        }
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

export function useUnclaimedRewards() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['unclaimed-rewards', profile?.user_id],
    queryFn: async () => {
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

export function useClaimReward() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      if (!profile?.user_id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.rpc('claim_challenge_reward', {
        p_user_id: profile.user_id,
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
      queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['user-level', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['locker-items'] });
      
      // Level up is handled by the caller via the returned data
    },
  });
}

/**
 * SINGLE consolidated realtime channel for all VybePass updates
 * (challenge rewards, level updates, challenge progress)
 * Replaces 3 separate channels.
 */
export function useRealtimeChallengeRewards(
  onNewReward?: (reward: ChallengeReward) => void,
  onLevelUp?: (data: { oldLevel: number; newLevel: number; rewards: VybePassReward[] }) => void,
) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const callbackRef = useRef(onNewReward);
  callbackRef.current = onNewReward;
  const levelUpRef = useRef(onLevelUp);
  levelUpRef.current = onLevelUp;
  const lastKnownLevel = useRef<number | null>(null);

  // Track current level
  useEffect(() => {
    if (!profile?.user_id) return;
    const cached = queryClient.getQueryData<UserLevel>(['user-level', profile.user_id]);
    if (cached) {
      lastKnownLevel.current = cached.current_level;
    }
  }, [profile?.user_id, queryClient]);

  useEffect(() => {
    if (!profile?.user_id || !profile?.id) return;

    const channel = supabase
      .channel(`vybepass-${profile.user_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'challenge_rewards',
          filter: `user_id=eq.${profile.user_id}`,
        },
        async (payload) => {
          const { data: reward } = await supabase
            .from('challenge_rewards')
            .select(`*, challenge:challenges(title, description)`)
            .eq('id', payload.new.id)
            .single();
          
          if (reward) {
            queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile.user_id] });
            callbackRef.current?.(reward as ChallengeReward);
            
            toast.success(
              `🎯 Challenge Complete! Claim your ${reward.xp_amount} XP reward!`,
              {
                duration: 8000,
                action: {
                  label: 'Claim',
                  onClick: () => {
                    navigationRef.current?.('/challenges');
                  },
                },
              }
            );
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_levels',
          filter: `user_id=eq.${profile.user_id}`,
        },
        (payload) => {
          const newLevel = (payload.new as any)?.current_level;
          const oldLevel = lastKnownLevel.current;
          
          queryClient.invalidateQueries({ queryKey: ['user-level', profile.user_id] });
          queryClient.invalidateQueries({ queryKey: ['locker-items'] });
          
          if (oldLevel && newLevel && newLevel > oldLevel) {
            lastKnownLevel.current = newLevel;
            const newRewards = (payload.new as any)?.unclaimed_rewards;
            levelUpRef.current?.({
              oldLevel,
              newLevel,
              rewards: Array.isArray(newRewards) ? newRewards : [],
            });
          } else if (newLevel) {
            lastKnownLevel.current = newLevel;
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_progress',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.user_id, profile?.id, queryClient]);
}

/**
 * @deprecated Use useRealtimeChallengeRewards which now includes level updates
 */
export function useRealtimeLevelUpdates() {
  // No-op — consolidated into useRealtimeChallengeRewards
}

/**
 * @deprecated Use useRealtimeChallengeRewards which now includes progress updates
 */
export function useRealtimeChallengeProgress() {
  // No-op — consolidated into useRealtimeChallengeRewards
}

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

export function useGrantPostXP() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (contentType: string = 'post') => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { data, error } = await supabase.rpc('grant_post_xp', {
        p_user_id: profile.id,
        p_content_type: contentType,
      });
      
      if (error) throw error;
      return data as { success: boolean; xp_granted: number; content_type: string; level_result: any };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['user-level', profile?.user_id] });
      queryClient.invalidateQueries({ queryKey: ['locker-items'] });
      
      toast.success(`+${data.xp_granted} XP for your ${data.content_type}!`, {
        duration: 3000,
      });
      
      // Level up is handled by the caller via the returned data
    },
  });
}
