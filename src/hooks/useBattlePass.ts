import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { navigationRef } from '@/lib/navigationRef';

export interface UserLevel {
  id: string;
  user_id: string;
  total_xp: number;
  current_level: number;
  unclaimed_rewards: BattlePassReward[];
  created_at: string;
  updated_at: string;
}

export interface BattlePassTier {
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

export interface BattlePassReward {
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
      if (!profile) return null;
      
      const { data, error } = await supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', profile.user_id)
        .maybeSingle();
      
      if (error) throw error;
      
      // If no record exists, ask the server to provision one safely (RPC), then re-fetch.
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
              unclaimed_rewards: (Array.isArray(retryData.unclaimed_rewards) ? retryData.unclaimed_rewards : []) as unknown as BattlePassReward[],
            } as UserLevel;
          }
          return null;
        } catch (e) {
          console.warn('[BattlePass] ensure_user_level failed:', e);
          return null;
        }
      }
      
      return {
        ...data,
        unclaimed_rewards: (Array.isArray(data.unclaimed_rewards) ? data.unclaimed_rewards : []) as unknown as BattlePassReward[],
      } as UserLevel;
    },
    enabled: !!profile,
    staleTime: 1000 * 60 * 2,
  });
}

/**
 * Fetch all battle pass tiers
 */
export function useBattlePassTiers() {
  return useQuery({
    queryKey: ['battle-pass-tiers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('battle_pass_tiers')
        .select('*')
        .order('level', { ascending: true });
      
      if (error) throw error;
      return data as BattlePassTier[];
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
    queryKey: ['unclaimed-rewards', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      
      const { data, error } = await supabase
        .from('challenge_rewards')
        .select(`
          *,
          challenge:challenges(title, description)
        `)
        .eq('user_id', profile.id)
        .eq('is_claimed', false)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ChallengeReward[];
    },
    enabled: !!profile,
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
      if (!profile) throw new Error('Not authenticated');
      
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
        new_rewards: BattlePassReward[];
        };
      };
      
      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-level', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.id] });
      
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
    if (!profile) return;

    const channel = subscribePostgresChannel(`challenge-rewards-${profile.id}`, [
      {
        event: 'INSERT',
        table: 'challenge_rewards',
        filter: `user_id=eq.${profile.id}`,
        callback: async (payload) => {
          if (import.meta.env.DEV) {
            console.log('[BattlePass] New reward received:', payload);
          }
          
          // Fetch the full reward with challenge info
          const { data: reward } = await supabase
            .from('challenge_rewards')
            .select(`*, challenge:challenges(title, description)`)
            .eq('id', payload.new.id)
            .single();
          
          if (reward) {
            queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile.id] });
            callbackRef.current?.(reward as ChallengeReward);
            
            // Show toast notification
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
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

/**
 * Real-time subscription for level updates
 */
export function useRealtimeLevelUpdates() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile) return;

    const channel = subscribePostgresChannel(`user-level-${profile.id}`, [
      {
        event: 'UPDATE',
        table: 'user_levels',
        filter: `user_id=eq.${profile.id}`,
        callback: (payload) => {
          if (import.meta.env.DEV) {
            console.log('[BattlePass] Level updated:', payload);
          }
          queryClient.invalidateQueries({ queryKey: ['user-level', profile.id] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

/**
 * Real-time subscription for challenge progress updates
 */
export function useRealtimeChallengeProgress() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile) return;

    const channel = subscribePostgresChannel(`challenge-progress-${profile.id}`, [
      {
        event: '*',
        table: 'challenge_progress',
        filter: `user_id=eq.${profile.id}`,
        callback: (payload) => {
          if (import.meta.env.DEV) {
            console.log('[BattlePass] Challenge progress updated:', payload);
          }
          queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile.id] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

/**
 * Calculate XP needed for next level
 */
export function useNextLevelProgress() {
  const { data: userLevel } = useUserLevel();
  const { data: tiers } = useBattlePassTiers();

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
