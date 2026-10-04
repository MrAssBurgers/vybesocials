import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ensureArray } from '@/lib/persistedCollections';
import { syncChallengeProgressAfterActivity } from '@/lib/challengeProgressClient';

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
 * Get today's date and this week's start in YYYY-MM-DD format (UTC — matches server rotation).
 */
function getDateFilters() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + mondayOffset));
  const weekStart = monday.toISOString().split('T')[0];
  return { today, weekStart };
}

async function runRotateChallenges(context: string): Promise<void> {
  const { error } = await db.rpc('rotate_challenges');
  if (error) {
    console.warn(`[challenges] rotate_challenges failed (${context}):`, error.message || error);
  }
}

/**
 * Fetch active challenges for the current period (today's daily, this week's weekly, all achievements)
 */
export function useChallenges() {
  return useQuery({
    queryKey: ['challenges'],
    queryFn: async () => {
      const { today, weekStart } = getDateFilters();

      // Read the lists together. Rotating the whole catalog is a Cloud Function
      // scan — only run it when today's dailies are actually missing.
      const [achievementsRes, dailiesRes, weekliesRes] = await Promise.all([
        db.from('challenges').select('*').eq('is_active', true).eq('type', 'achievement'),
        db.from('challenges').select('*').eq('is_active', true).eq('type', 'daily').eq('active_date', today),
        db.from('challenges').select('*').eq('is_active', true).eq('type', 'weekly').eq('active_week_start', weekStart),
      ]);

      const { data: achievements, error: achError } = achievementsRes;
      if (achError) throw achError;

      const { data: dailies, error: dailyError } = dailiesRes;
      if (dailyError) throw dailyError;

      const { data: weeklies, error: weeklyError } = weekliesRes;
      if (weeklyError) throw weeklyError;
      
      let finalDailies = dailies || [];

      // Self-heal: if today's challenges are missing, ask the DB to
      // populate them from the template library, then re-fetch once.
      if (finalDailies.length === 0) {
        await runRotateChallenges('self-heal');
        const { data: refreshed } = await db
          .from('challenges')
          .select('*')
          .eq('is_active', true)
          .eq('type', 'daily')
          .eq('active_date', today);
        finalDailies = refreshed || [];
      }

      // Final fallback: NULL-dated dailies
      if (finalDailies.length === 0) {
        const { data: fallbackDailies } = await db
          .from('challenges')
          .select('*')
          .eq('is_active', true)
          .eq('type', 'daily')
          .is('active_date', null);
        finalDailies = fallbackDailies || [];
      }
      
      // Fallback: if no date-specific weeklies, fetch ones with NULL active_week_start
      let finalWeeklies = weeklies || [];
      if (finalWeeklies.length === 0) {
        const { data: fallbackWeeklies, error: fbError } = await db
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
    select: (data) => ensureArray<Challenge>(data),
    refetchOnWindowFocus: false,
  });
}

/**
 * Fetch user's challenge progress
 */
export function useUserChallengeProgress() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['challenge-progress', profileId],
    queryFn: async () => {
      if (!profileId) return [];
      
      const { data, error } = await db
        .from('challenge_progress')
        .select(`
          *,
          challenge:challenges(*)
        `)
        .eq('user_id', profileId);
      
      if (error) throw error;
      
      return (data || []).map(cp => ({
        ...cp,
        challenge: cp.challenge as Challenge,
      })) as ChallengeProgress[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
    select: (data) => ensureArray<ChallengeProgress>(data),
  });
}

/**
 * Get combined challenges with progress and reward claim status
 */
export function useChallengesWithProgress() {
  const { data: challenges, isLoading: challengesLoading } = useChallenges();
  const { data: progress } = useUserChallengeProgress();
  const { profile, user } = useAuth();
  const authUserId = profile?.user_id || user?.id;

  // Fetch claimed rewards to know which completed challenges have been claimed
  const { data: claimedRewards } = useQuery({
    queryKey: ['claimed-rewards', authUserId, profile?.id],
    queryFn: async () => {
      if (!authUserId) return [];
      const { data, error } = await db
        .from('challenge_rewards')
        .select('challenge_id, is_claimed')
        .in('user_id', [...new Set([authUserId, profile?.id].filter((id): id is string => !!id))]);
      if (error) throw error;
      return data || [];
    },
    enabled: !!authUserId,
    networkMode: 'always',
    staleTime: 1000 * 60 * 2,
    select: (data) => ensureArray<{ challenge_id: string; is_claimed: boolean }>(data),
  });

  const challengeList = ensureArray<Challenge>(challenges);
  const progressList = ensureArray<ChallengeProgress>(progress);
  const claimedList = ensureArray<{ challenge_id: string; is_claimed: boolean }>(claimedRewards);

  const combined = challengeList.map(challenge => {
    const userProgress = progressList.find(p => p.challenge_id === challenge.id);
    const isClaimed = claimedList.some(r => r.challenge_id === challenge.id && r.is_claimed === true);
    
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

      // Server-side RPC: enforces validation, prevents tampering with
      // is_completed / current_count and protects reward triggers.
      const { data, error } = await db.rpc('increment_challenge_progress', {
        p_challenge_id: challengeId,
        p_increment: increment,
      });

      if (error) throw error;

      const result = (data || {}) as {
        is_completed?: boolean;
        new_count?: number;
        was_already_completed?: boolean;
      };

      return {
        isCompleted: !!result.is_completed,
        newCount: result.new_count ?? 0,
        wasAlreadyCompleted: !!result.was_already_completed,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['challenge-progress', profile?.id] });
      syncChallengeProgressAfterActivity(profile?.id);
      if (data.isCompleted && !data.wasAlreadyCompleted) {
        // Invalidate rewards to show the new claimable reward
        queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards', profile?.id] });
        queryClient.invalidateQueries({ queryKey: ['user-badges', profile?.id] });
      }
    },
  });
}
