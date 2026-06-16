import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

interface LeaderboardEntry {
  profile_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  invite_count: number;
  rank: number;
}

/**
 * Fetch the global invite leaderboard
 * Shows top 10 inviters by successful referrals
 */
export function useInviteLeaderboard(limit = 10) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['invite-leaderboard', limit],
    queryFn: async () => {
      // Query the view
      const { data, error } = await db
        .from('invite_leaderboard')
        .select('*')
        .limit(limit);
      
      if (error) {
        console.error('[useInviteLeaderboard] Error:', error);
        throw error;
      }
      
      const entries = (data || []) as LeaderboardEntry[];
      
      // Check if current user is in the top results
      const currentUserEntry = profile?.id 
        ? entries.find(e => e.profile_id === profile.id)
        : null;
      
      // If user not in top results, fetch their rank separately
      let userRankEntry: LeaderboardEntry | null = null;
      if (profile?.id && !currentUserEntry) {
        const { data: userData } = await db
          .from('invite_leaderboard')
          .select('*')
          .eq('profile_id', profile.id)
          .single();
        
        if (userData) {
          userRankEntry = userData as LeaderboardEntry;
        }
      }
      
      return {
        entries,
        currentUserEntry: currentUserEntry || userRankEntry,
        currentUserInTop: !!currentUserEntry,
      };
    },
    staleTime: 30000, // Cache for 30 seconds
    refetchInterval: 60000, // Refresh every minute
  });
}
