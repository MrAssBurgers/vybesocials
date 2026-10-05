import { usePostReadView } from './usePostReadView';
import { readSocialPostSummary } from '@/lib/socialPostListService';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

export interface ActivityStats {
  recentPosts: number | null;
  recentPostsHasMore?: boolean;
  activeLevelUps: number;
  badgesClaimed: number;
  activeChats: number;
}

/**
 * Fetches lightweight activity stats for the live activity ticker.
 * Refreshes every 60s to keep things fresh without heavy polling.
 */
export function useActivityStats() {
  const summary = useRecentPostSummary('five-minutes');
  const query = useQuery({
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
        Promise.resolve({ count: 0 }),
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
  return { ...query, data: query.data ? { ...query.data, recentPosts: summary.data?.count ?? null, recentPostsHasMore: summary.data?.hasMore ?? false } : undefined };
}

export interface RhythmData {
  topXPGainer: { username: string; xp: number } | null;
  activeChallenge: { title: string; endsIn: string } | null;
  trendingTag: string | null;
  totalPostsToday: number | null;
  totalPostsHasMore?: boolean;
}

/**
 * Fetches data for the Weekly Rhythm "Now" banner.
 * Refreshes every 5 minutes.
 */
export function useRhythmData() {
  const summary = useRecentPostSummary('today');
  const query = useQuery({
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
        Promise.resolve({ data: [] as { tags: string[] }[], count: 0 }),
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
  const topTag = summary.data?.tags.find(([, count]) => count >= 2)?.[0] ?? null;
  return { ...query, data: query.data ? { ...query.data, totalPostsToday: summary.data?.count ?? null, totalPostsHasMore: summary.data?.hasMore ?? false, trendingTag: topTag } : undefined };
}

function useRecentPostSummary(window: 'today' | 'five-minutes') {
  const view = usePostReadView(true), { account } = view;
  const since = window === 'today' ? new Date(new Date(view.now).setHours(0, 0, 0, 0)).toISOString() : new Date(Math.floor(view.now / 60000) * 60000 - 300000).toISOString();
  const query = useQuery({ placeholderData: undefined, queryKey: ['post-activity-summary', window, since, ...view.key], enabled: view.active, staleTime: 0, gcTime: 0, retry: false,
    refetchInterval: 20000, refetchOnMount: 'always', refetchOnWindowFocus: 'always', queryFn: ({ signal }) => readSocialPostSummary({ expectedOwnerUid: account.user!.id, expectedProfileId: account.profile!.id, scope: 'recent', since }, () => view.guard(signal)) });
  return { ...query, data: view.active && !query.isPlaceholderData && !query.isError && query.data && query.data.leaseUntil > view.now ? query.data : undefined };
}
