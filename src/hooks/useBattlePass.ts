import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { db, getFirebaseAuth } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { claimChallengeRewardOnce } from '@/lib/challengeClaimOnce';
import { tokenAccountGuard, tokenMarketplaceRequest } from '@/lib/tokenMarketplaceService';

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

export function unclaimedChallengeRewards(rows: ChallengeReward[], ownerIds: string[]): ChallengeReward[] {
  const own = rows.filter(row => ownerIds.includes(row.user_id));
  const claimed = new Set(own.filter(row => row.is_claimed === true).map(row => row.challenge_id));
  const unique = new Map<string, ChallengeReward>();
  for (const row of own) {
    if (row.is_claimed !== false || claimed.has(row.challenge_id)) continue;
    const key = row.challenge_id || row.id;
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

/**
 * Fetch user's level and XP
 */
export function useUserLevel() {
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ['user-level', user?.id, profile?.id],
    queryFn: async () => {
      if (!profile || !user || profile.user_id !== user.id || getFirebaseAuth().currentUser?.uid !== user.id) return null;
      
      const { data, error } = await db
        .from('user_levels')
        .select('*')
        .in('user_id', [...new Set([user.id, profile.id])])
        .maybeSingle();
      
      if (error) throw error;
      
      // If no record exists, ask the server to provision one safely (RPC), then re-fetch.
      if (!data) {
        try {
          if (getFirebaseAuth().currentUser?.uid !== user.id) throw new Error('Account changed');
          const { error: ensureError } = await db.rpc('ensure_user_level');
          if (ensureError) throw ensureError;
          if (getFirebaseAuth().currentUser?.uid !== user.id) throw new Error('Account changed');
          const { data: retryData } = await db
            .from('user_levels')
            .select('*')
            .in('user_id', [...new Set([user.id, profile.id])])
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
    enabled: !!profile && !!user && profile.user_id === user.id,
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
      const { data, error } = await db
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
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ['unclaimed-rewards', profile?.id, user?.id],
    queryFn: async () => {
      if (!profile || !user || profile.user_id !== user.id || getFirebaseAuth().currentUser?.uid !== user.id) return [];
      
      const { data, error } = await db
        .from('challenge_rewards')
        .select(`
          *,
          challenge:challenges(title, description)
        `)
        .in('user_id', [...new Set([user.id, profile.id])])
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return unclaimedChallengeRewards((data || []) as ChallengeReward[], [user.id, profile.id]);
    },
    enabled: !!profile && !!user && profile.user_id === user.id,
    staleTime: 1000 * 30,
  });
}

/**
 * Claim a challenge reward
 */
export function useClaimReward() {
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();

  return useMutation({
    mutationFn: async (rewardId: string) => {
      if (!profile || !user || profile.user_id !== user.id || getFirebaseAuth().currentUser?.uid !== user.id) throw new Error('Not authenticated');
      const actorGuard = tokenAccountGuard(user.id);
      actorGuard();
      
      const { data, error } = await db.rpc('claim_challenge_reward', {
        p_reward_id: rewardId,
      });
      
      if (error) throw error;
      actorGuard();
      
      const result = data as unknown as {
        success: boolean;
        challenge_id?: string;
        xp_gained: number;
        level_result: {
          old_level: number;
          new_level: number;
          total_xp: number;
          level_up: boolean;
        new_rewards: BattlePassReward[];
        };
      };
      
      if (result?.success !== true) throw new Error('Your reward was not confirmed. Please try again.');
      return { ...result, actorUid: user.id, profileId: profile.id, actorGuard };
    },
    onSuccess: (data) => {
      if (getFirebaseAuth().currentUser?.uid !== data.actorUid) return;
      try { data.actorGuard(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', data.profileId, data.actorUid] });
      queryClient.invalidateQueries({ queryKey: ['user-level', data.actorUid] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', data.profileId] });
      queryClient.invalidateQueries({ queryKey: ['claimed-rewards', data.actorUid] });
      if (typeof data.challenge_id === 'string' && data.challenge_id) {
        void tokenMarketplaceRequest({ action: 'earn', type: 'challenge_completed', referenceId: data.challenge_id }, data.actorGuard)
          .then(() => { data.actorGuard(); queryClient.invalidateQueries({ queryKey: ['token-marketplace', data.actorUid] }); })
          .catch(() => {});
      }
      
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
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const callbackRef = useRef(onNewReward);
  callbackRef.current = onNewReward;

  useEffect(() => {
    if (!profile || !user || profile.user_id !== user.id) return;
    let active = true;
    const seen = new Set<string>();
    const ownerIds = [...new Set([user.id, profile.id])];

    const channel = subscribePostgresChannel(`challenge-rewards-${user.id}-${profile.id}`, ownerIds.map(ownerId => ({
        event: '*',
        table: 'challenge_rewards',
        filter: `user_id=eq.${ownerId}`,
        callback: async (payload) => {
          if (!active || getFirebaseAuth().currentUser?.uid !== user.id) return;
          queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile.id, user.id] });
          queryClient.invalidateQueries({ queryKey: ['claimed-rewards', user.id] });
          if (payload.eventType !== 'INSERT' || payload.new.is_claimed !== false) return;
          
          // Fetch the full reward with challenge info
          const { data: reward } = await db
            .from('challenge_rewards')
            .select(`*, challenge:challenges(title, description)`)
            .eq('id', payload.new.id)
            .single();
          
          if (active && getFirebaseAuth().currentUser?.uid === user.id && reward && reward.is_claimed === false && ownerIds.includes(reward.user_id) && !seen.has(reward.challenge_id)) {
            seen.add(reward.challenge_id);
            void claimChallengeRewardOnce(reward.id, Number(reward.xp_amount) || 0, reward.challenge_id);
            callbackRef.current?.(reward as ChallengeReward);
          }
        },
      })));

    return () => {
      active = false;
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, profile?.user_id, user?.id, queryClient]);
}

/**
 * Real-time subscription for level updates
 */
export function useRealtimeLevelUpdates() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile || !user || profile.user_id !== user.id) return;

    const channel = subscribePostgresChannel(`user-level-${user.id}-${profile.id}`, [...new Set([user.id, profile.id])].map(ownerId => ({
        event: '*',
        table: 'user_levels',
        filter: `user_id=eq.${ownerId}`,
        callback: () => {
          if (getFirebaseAuth().currentUser?.uid !== user.id) return;
          queryClient.invalidateQueries({ queryKey: ['user-level', user.id] });
        },
      })));

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, profile?.user_id, user?.id, queryClient]);
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
