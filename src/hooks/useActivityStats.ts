import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

export interface ActivityStats {
  recentPosts: number;
  activeLevelUps: number;
  badgesClaimed: number;
  activeChats: number;
}

/**
 * Fetches lightweight activity stats for the live activity ticker.
 * Refreshes every 60s to keep things fresh without heavy polling.
 */
export function useActivityStats() {
  return useQuery({
    queryKey: ['activity-stats'],
    queryFn: async (): Promise<ActivityStats> => {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const empty: ActivityStats = {
        recentPosts: 0,
        activeLevelUps: 0,
        badgesClaimed: 0,
        activeChats: 0,
      };

      try {
        // Run all queries in parallel - lightweight counts only
        const [postsRes, levelUpsRes, badgesRes, chatsRes] = await Promise.all([
        // Posts in last 5 minutes
        db
          .from('posts')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', fiveMinAgo),
        // Level ups today (user_levels updated today with level > 1)
        db
          .from('user_levels')
          .select('id', { count: 'exact', head: true })
          .gte('updated_at', todayStart)
          .gt('current_level', 1),
        // Badges claimed today
        db
          .from('challenge_rewards')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', todayStart)
          .eq('is_claimed', true),
        // Active conversations (messages in last 5 min)
        db
          .from('messages')
          .select('conversation_id', { count: 'exact', head: true })
          .gte('created_at', fiveMinAgo),
      ]);

      return {
        recentPosts: postsRes.count || 0,
        activeLevelUps: levelUpsRes.count || 0,
        badgesClaimed: badgesRes.count || 0,
        activeChats: chatsRes.count || 0,
      };
      } catch {
        return empty;
      }
    },
    staleTime: 1000 * 60, // 60s
    refetchInterval: 1000 * 60, // auto-refresh every 60s
    retry: false,
    placeholderData: {
      recentPosts: 0,
      activeLevelUps: 0,
      badgesClaimed: 0,
      activeChats: 0,
    },
  });
}

export interface RhythmData {
  topXPGainer: { username: string; xp: number } | null;
  activeChallenge: { title: string; endsIn: string } | null;
  trendingTag: string | null;
  totalPostsToday: number;
}

/**
 * Fetches data for the Weekly Rhythm "Now" banner.
 * Refreshes every 5 minutes.
 */
export function useRhythmData() {
  return useQuery({
    queryKey: ['rhythm-data'],
    queryFn: async (): Promise<RhythmData> => {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const [topXPRes, challengeRes, postsRes] = await Promise.all([
        // Top XP gainer today
        db
          .from('user_levels')
          .select('total_xp, user_id')
          .gte('updated_at', todayStart)
          .order('total_xp', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Active challenge ending soonest
        db
          .from('challenges')
          .select('title, ends_at')
          .eq('is_active', true)
          .not('ends_at', 'is', null)
          .gte('ends_at', now.toISOString())
          .order('ends_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
        // Total posts today
        db
          .from('posts')
          .select('id, tags', { count: 'exact', head: false })
          .gte('created_at', todayStart)
          .limit(100),
      ]);

      // Get username for top XP gainer
      let topXPGainer = null;
      if (topXPRes.data?.user_id) {
        const { data: profile } = await db
          .from('profiles')
          .select('username')
          .eq('user_id', topXPRes.data.user_id)
          .maybeSingle();
        if (profile) {
          topXPGainer = { username: profile.username, xp: topXPRes.data.total_xp };
        }
      }

      // Calculate challenge countdown
      let activeChallenge = null;
      if (challengeRes.data?.ends_at) {
        const endsAt = new Date(challengeRes.data.ends_at);
        const diffMs = endsAt.getTime() - now.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        activeChallenge = {
          title: challengeRes.data.title,
          endsIn: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
        };
      }

      // Find trending tag
      let trendingTag = null;
      if (postsRes.data && postsRes.data.length > 0) {
        const tagCounts: Record<string, number> = {};
        for (const post of postsRes.data) {
          if (post.tags && Array.isArray(post.tags)) {
            for (const tag of post.tags) {
              tagCounts[tag] = (tagCounts[tag] || 0) + 1;
            }
          }
        }
        const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
        if (sorted.length > 0 && sorted[0][1] >= 2) {
          trendingTag = sorted[0][0];
        }
      }

      return {
        topXPGainer,
        activeChallenge,
        trendingTag,
        totalPostsToday: postsRes.count || 0,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 min
    refetchInterval: 1000 * 60 * 5,
  });
}
