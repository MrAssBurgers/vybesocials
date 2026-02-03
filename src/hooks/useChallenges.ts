import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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
 * Fetch all active challenges
 */
export function useChallenges() {
  return useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('*')
        .eq('is_active', true)
        .order('type', { ascending: true });
      
      if (error) throw error;
      return data as Challenge[];
    },
    staleTime: 1000 * 60 * 15,
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
 * Get combined challenges with progress
 */
export function useChallengesWithProgress() {
  const { data: challenges } = useChallenges();
  const { data: progress } = useUserChallengeProgress();

  const combined = challenges?.map(challenge => {
    const userProgress = progress?.find(p => p.challenge_id === challenge.id);
    return {
      ...challenge,
      current_count: userProgress?.current_count || 0,
      is_completed: userProgress?.is_completed || false,
      completed_at: userProgress?.completed_at || null,
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
      
      // Upsert progress
      const { data: existing } = await supabase
        .from('challenge_progress')
        .select('*')
        .eq('user_id', profile.id)
        .eq('challenge_id', challengeId)
        .maybeSingle();
      
      const newCount = (existing?.current_count || 0) + increment;
      
      // Get challenge to check if completed
      const { data: challenge } = await supabase
        .from('challenges')
        .select('*')
        .eq('id', challengeId)
        .single();
      
      const isCompleted = newCount >= (challenge?.requirement_count || 1);
      
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
      
      // If completed and has badge reward, award it
      if (isCompleted && challenge?.reward_badge_id) {
        await supabase.rpc('award_badge', {
          p_user_id: profile.id,
          p_badge_id: challenge.reward_badge_id,
        });
      }
      
      return { isCompleted, newCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.id] });
    },
  });
}
