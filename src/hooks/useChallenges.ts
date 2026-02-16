import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Maps challenge requirement_type to the route where users can complete it
 */
export const CHALLENGE_ROUTES: Record<string, string> = {
  'post': '/upload',
  'clip': '/upload',
  'story': '/upload',
  'comment': '/explore',
  'like': '/explore',
  'react': '/explore',
  'follow': '/explore',
  'follower': '/u/me',
  'friend_added': '/explore',
  'message': '/messages',
  'new_conversation': '/messages',
  'snap_sent': '/messages',
  'channel_message': '/communities',
  'bookmark': '/explore',
  'complete_profile': '/settings',
  'invite': '/invite-friends',
  'daily_login': '/',
  'login': '/',
};

export interface Challenge {
  id: string;
  title: string;
  description: string | null;
  type: 'daily' | 'weekly' | 'achievement';
  requirement_type: string;
  requirement_count: number;
  reward_badge_id: string | null;
  reward_xp: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  active_date: string | null;
  active_week_start: string | null;
}

export interface ChallengeProgress {
  id: string;
  user_id: string;
  challenge_id: string;
  current_count: number;
  is_completed: boolean;
  completed_at: string | null;
  challenge: Challenge;
}

/**
 * Get today's date and this week's start in YYYY-MM-DD format
 */
function getDateFilters() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  // Get Monday of current week
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const weekStart = monday.toISOString().split('T')[0];
  return { today, weekStart };
}

/**
 * Fetch active challenges for the current period (today's daily, this week's weekly, all achievements)
 */
export function useChallenges() {
  return useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const { today, weekStart } = getDateFilters();
      
      // Fetch achievements (no date filter)
      const { data: achievements, error: achError } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .eq('type', 'achievement');
      
      if (achError) throw achError;
      
      // Fetch today's daily challenges (date-specific first)
      const { data: dailies, error: dailyError } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .eq('type', 'daily')
        .eq('active_date', today);
      
      if (dailyError) throw dailyError;
      
      // Fallback: if no date-specific dailies, fetch ones with NULL active_date
      let finalDailies = dailies || [];
      if (finalDailies.length === 0) {
        const { data: fallbackDailies, error: fbError } = await supabase
          .from('challenges')
          .select('*')
          .eq('is_active', true)
          .eq('type', 'daily')
          .is('active_date', null);
        if (fbError) throw fbError;
        finalDailies = fallbackDailies || [];
      }
      
      // Fetch this week's weekly challenges (date-specific first)
      const { data: weeklies, error: weeklyError } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .eq('type', 'weekly')
        .eq('active_week_start', weekStart);
      
      if (weeklyError) throw weeklyError;
      
      // Fallback: if no date-specific weeklies, fetch ones with NULL active_week_start
      let finalWeeklies = weeklies || [];
      if (finalWeeklies.length === 0) {
        const { data: fallbackWeeklies, error: fbError } = await supabase
          .from('challenges')
          .select('*')
          .eq('is_active', true)
          .eq('type', 'weekly')
          .is('active_week_start', null);
        if (fbError) throw fbError;
        finalWeeklies = fallbackWeeklies || [];
      }
      
      return [...(achievements || []), ...finalDailies, ...finalWeeklies] as Challenge[];
    },
    staleTime: 1000 * 60 * 5,
    // Refetch when window regains focus (handles day/week boundaries)
    refetchOnWindowFocus: true,
  });
}

/**
 * Fetch user's challenge progress
 */
export function useUserChallengeProgress() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['challenge-progress', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      
      const { data, error } = await supabase
        .from('challenge_progress')
        .select(`
          *,
          challenge:challenges(*)
        `)
        .eq('user_id', profile.id);
      
      if (error) throw error;
      
      return (data || []).map(cp => ({
        ...cp,
        challenge: cp.challenge as Challenge,
      })) as ChallengeProgress[];
    },
    enabled: !!profile,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Get combined challenges with progress and reward claim status
 */
export function useChallengesWithProgress() {
  const { data: challenges, isLoading: challengesLoading } = useChallenges();
  const { data: progress } = useUserChallengeProgress();
  const { profile } = useAuth();

  // Fetch claimed rewards to know which completed challenges have been claimed
  const { data: claimedRewards } = useQuery({
    queryKey: ['claimed-rewards', profile?.user_id],
    queryFn: async () => {
      if (!profile?.user_id) return [];
      const { data, error } = await supabase
        .from('challenge_rewards')
        .select('challenge_id, is_claimed')
        .eq('user_id', profile.user_id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.user_id,
    staleTime: 1000 * 60 * 2,
  });

  const combined = challenges?.map(challenge => {
    const userProgress = progress?.find(p => p.challenge_id === challenge.id);
    const reward = claimedRewards?.find(r => r.challenge_id === challenge.id);
    const isClaimed = reward?.is_claimed === true;
    
    return {
      ...challenge,
      current_count: userProgress?.current_count || 0,
      is_completed: userProgress?.is_completed || false,
      completed_at: userProgress?.completed_at || null,
      is_claimed: isClaimed,
      progress_percentage: Math.min(
        100,
        ((userProgress?.current_count || 0) / challenge.requirement_count) * 100
      ),
    };
  });

  return {
    daily: combined?.filter(c => c.type === 'daily') || [],
    weekly: combined?.filter(c => c.type === 'weekly') || [],
    achievements: combined?.filter(c => c.type === 'achievement') || [],
    all: combined || [],
    isLoading: challengesLoading,
  };
}

/**
 * Update challenge progress
 */
export function useUpdateChallengeProgress() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      challengeId,
      increment = 1,
    }: {
      challengeId: string;
      increment?: number;
    }) => {
      if (!profile) throw new Error('Not authenticated');
      
      // Get current progress
      const { data: existing } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', profile.id)
        .eq('challenge_id', challengeId)
        .maybeSingle();
      
      // If already completed, skip
      if (existing?.is_completed) {
        return { isCompleted: true, newCount: existing.current_count, wasAlreadyCompleted: true };
      }
      
      const newCount = (existing?.current_count || 0) + increment;
      
      // Get challenge to check if completed
      const { data: challenge } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challengeId)
        .single();
      
      const isCompleted = newCount >= (challenge?.requirement_count || 1);
      
      // Upsert progress - the trigger will create the reward if completed
      const { error } = await supabase
        .from('challenge_progress')
        .upsert({
          user_id: profile.id,
          challenge_id: challengeId,
          current_count: newCount,
          is_completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,challenge_id',
        });
      
      if (error) throw error;
      
      return { isCompleted, newCount, wasAlreadyCompleted: false };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile?.id] });
      if (data.isCompleted && !data.wasAlreadyCompleted) {
        // Invalidate rewards to show the new claimable reward
        queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile?.id] });
        queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.id] });
      }
    },
  });
}
