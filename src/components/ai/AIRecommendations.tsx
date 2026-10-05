import { readCommentCounts } from '@/lib/commentService';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { PostCard } from '@/components/posts/PostCard';
import { toast } from 'sonner';
import { invokeEdgeFeature } from '@/lib/edgeFeature';

interface Post {
  id: string;
  type: string;
  media_url: string;
  caption: string | null;
  tags: string[] | null;
  created_at: string;
  author: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
  like_count: number;
  comment_count: number;
  is_liked: boolean;
  is_bookmarked: boolean;
}

export function AIRecommendations() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const getUserLocation = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 300000 }
      );
    });
  };

  const fetchRecommendations = async (retryCount = 0) => {
    if (!profile) return;
    
    setIsLoading(true);
    
    try {
      const location = await getUserLocation();
      const { data, unavailable } = await invokeEdgeFeature<{
        posts?: { id: string }[];
        recommended_ids?: string[];
        reason?: string;
      }>('get-recommendations', {
        interests: profile.interests || [],
        userId: profile.id,
        location,
      });

      if (unavailable || !data) {
        await fetchFallbackPosts();
        return;
      }

      const recommended_ids = data.recommended_ids || data.posts?.map((p) => p.id) || [];
      setReason(data.reason || 'Based on your interests');

      if (recommended_ids && recommended_ids.length > 0) {
        const { data } = await db
          .from('posts')
          .select(`
            id, type, media_url, caption, tags, created_at,
            author:profiles!posts_author_id_fkey(id, username, avatar_url)
          `)
          .in('id', recommended_ids)
          .eq('type', 'post');

        if (data) {
          const enriched = await enrichPosts(data);
          // Sort by recommended order
          const sorted = recommended_ids
            .map((id: string) => enriched.find(p => p.id === id))
            .filter(Boolean) as Post[];
          setPosts(sorted);
        }
      } else {
        // No AI recommendations, use fallback
        await fetchFallbackPosts();
      }
    } catch (error) {
      console.error('Recommendation error:', error);
      // Retry once with exponential backoff
      if (retryCount < 1) {
        setTimeout(() => fetchRecommendations(retryCount + 1), 1000 * (retryCount + 1));
        return;
      }
      // After retry fails, use fallback
      await fetchFallbackPosts();
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  };

  const fetchFallbackPosts = async () => {
    const { data } = await db
      .from('posts')
      .select(`
        id, type, media_url, caption, tags, created_at,
        author:profiles!posts_author_id_fkey(id, username, avatar_url)
      `)
      .eq('type', 'post')
      .order('created_at', { ascending: false })
      .limit(5);
    
    if (data) {
      const enriched = await enrichPosts(data);
      setPosts(enriched);
      setReason('Showing trending posts');
    }
  };

  const enrichPosts = async (data: any[]): Promise<Post[]> => {
    if (!profile) return [];
    
    const postIds = data.map(p => p.id);
    
    const [likesRes, bookmarksRes, likeCountsRes, commentCountsRes] = await Promise.all([
      db.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      db.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      db.from('likes').select('post_id').in('post_id', postIds),
      readCommentCounts(postIds, profile.id),
    ]);

    const likedIds = new Set(likesRes.data?.map(l => l.post_id) || []);
    const bookmarkedIds = new Set(bookmarksRes.data?.map(b => b.post_id) || []);
    
    const likeCounts: Record<string, number> = {};
    const commentCounts = commentCountsRes;
    
    likeCountsRes.data?.forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
    });


    return data.map(post => ({
      ...post,
      like_count: likeCounts[post.id] || 0,
      comment_count: commentCounts[post.id] || 0,
      is_liked: likedIds.has(post.id),
      is_bookmarked: bookmarkedIds.has(post.id),
    }));
  };

  useEffect(() => {
    if (profile && !hasLoaded) {
      fetchRecommendations();
    }
  }, [profile]);

  if (!hasLoaded && !isLoading) {
    return null;
  }

  return (
    <div className="space-y-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <VybeMiniIcon size={20} showSparkles />
          <h2 className="font-semibold">For You</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fetchRecommendations()}
          disabled={isLoading}
          className="gap-1"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {reason && (
        <p className="text-xs text-muted-foreground">{reason}</p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.slice(0, 3).map((post, index) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <PostCard post={post} />
            </motion.div>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-4">
          No recommendations yet. Explore more content!
        </p>
      )}
    </div>
  );
}
