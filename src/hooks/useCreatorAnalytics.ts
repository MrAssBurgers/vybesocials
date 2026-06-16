import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

/**
 * Fetch content performance metrics for the creator's posts
 */
export function useCreatorContentStats() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-content-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      // Get post stats
      const { data: posts, error: postsErr } = await db
        .from('posts')
        .select('id, type, caption, view_count, created_at')
        .eq('author_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsErr) throw postsErr;
      if (!posts || posts.length === 0) return { posts: [], totalLikes: 0, totalComments: 0, totalViews: 0, topPosts: [], engagementRate: 0 };

      const postIds = posts.map(p => p.id);

      // Batch fetch likes and comments counts
      const [likesRes, commentsRes] = await Promise.all([
        db.from('likes').select('post_id', { count: 'exact' }).in('post_id', postIds),
        db.from('comments').select('post_id', { count: 'exact' }).in('post_id', postIds),
      ]);

      // Count likes per post
      const likesByPost: Record<string, number> = {};
      likesRes.data?.forEach(l => {
        likesByPost[l.post_id] = (likesByPost[l.post_id] || 0) + 1;
      });

      const commentsByPost: Record<string, number> = {};
      commentsRes.data?.forEach(c => {
        commentsByPost[c.post_id] = (commentsByPost[c.post_id] || 0) + 1;
      });

      const totalLikes = likesRes.count || 0;
      const totalComments = commentsRes.count || 0;
      const totalViews = posts.reduce((sum, p) => sum + (p.view_count || 0), 0);

      // Engagement rate = (likes + comments) / views * 100
      const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

      // Top posts by engagement
      const topPosts = posts
        .map(p => ({
          ...p,
          likes: likesByPost[p.id] || 0,
          comments: commentsByPost[p.id] || 0,
          engagement: (likesByPost[p.id] || 0) + (commentsByPost[p.id] || 0),
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 5);

      return { posts, totalLikes, totalComments, totalViews, topPosts, engagementRate };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetch follower growth data
 */
export function useFollowerGrowth() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['follower-growth', user?.id],
    queryFn: async () => {
      if (!user?.id) return { total: 0, recentFollowers: [] };

      const { count } = await db
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', user.id);

      // Recent followers (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: recent } = await db
        .from('follows')
        .select('created_at')
        .eq('following_id', user.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true });

      return {
        total: count || 0,
        recentFollowers: recent || [],
      };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
}
