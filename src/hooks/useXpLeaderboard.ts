import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  total_xp: number;
  current_level: number;
  rank: number;
}

/**
 * Global XP leaderboard - top users by total XP
 */
export function useXpLeaderboard(limit = 20) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['xp-leaderboard', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('xp_leaderboard' as any)
        .select('*')
        .limit(limit);

      if (error) throw error;
      const entries = (data || []) as unknown as LeaderboardEntry[];

      // Get current user's rank if not in top
      let userEntry: LeaderboardEntry | null = null;
      if (user?.id && !entries.find(e => e.user_id === user.id)) {
        const { data: userData } = await supabase
          .from('xp_leaderboard' as any)
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();
        if (userData) userEntry = userData as unknown as LeaderboardEntry;
      }

      return { entries, userEntry };
    },
    staleTime: 60000,
  });
}

/**
 * Friends-only XP leaderboard
 */
export function useFriendsXpLeaderboard() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['friends-xp-leaderboard', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get friend IDs
      const { data: friendships } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`);

      const friendIds = (friendships || []).map(f => 
        f.sender_id === user.id ? f.receiver_id : f.sender_id
      );
      friendIds.push(user.id); // Include self

      if (friendIds.length === 0) return [];

      const { data, error } = await supabase
        .from('xp_leaderboard' as any)
        .select('*')
        .in('user_id', friendIds)
        .limit(50);

      if (error) throw error;

      // Re-rank within friends
      return ((data || []) as unknown as LeaderboardEntry[])
        .sort((a, b) => b.total_xp - a.total_xp)
        .map((entry, i) => ({ ...entry, rank: i + 1 }));
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });
}
