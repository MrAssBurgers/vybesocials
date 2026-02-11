import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Maps challenge requirement_type to the route where users can complete it
 */
export const CHALLENGE_ROUTES: Record<string, string> = {
  'post': '/upload',
  'comment': '/explore',
  'like': '/explore',
  'follow': '/explore',
  'follower': '/u/me',
  'message': '/messages',
  'new_conversation': '/messages',
  'complete_profile': '/settings',
  'invite': '/invite',
  'login': '/', // No navigation needed
  'snap_sent': '/messages', // For sending VYBEs
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
      
      // Fetch today's daily challenges
      const { data: dailies, error: dailyError } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .eq('type', 'daily')
        .eq('active_date', today);
      
      if (dailyError) throw dailyError;
      
      // Fetch this week's weekly challenges
      const { data: weeklies, error: weeklyError } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .eq('type', 'weekly')
        .eq('active_week_start', weekStart);
      
      if (weeklyError) throw weeklyError;
      
      return [...(achievements || []), ...(dailies || []), ...(weeklies || [])] as Challenge[];
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
  const { data: challenges } = useChallenges();
  const { data: progress } = useUserChallengeProgress();
  const { profile } = useAuth();

  // Fetch claimed rewards to know which completed challenges have been claimed
  const { data: claimedRewards } = useQuery({
    queryKey: ['claimed-rewards', profile?.id],
    queryFn: async () => {
      if (!profile) return [];
      const { data, error } = await supabase
        .from('challenge_rewards')
        .select('challenge_id, is_claimed')
        .eq('user_id', profile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile,
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
