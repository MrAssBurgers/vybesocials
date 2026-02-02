import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { PostCard } from '@/components/posts/PostCard';
import { toast } from 'sonner';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';

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

  const fetchRecommendations = async (retryCount = 0) => {
    if (!profile) return;
    
    setIsLoading(true);
    
    try {
      const headers = await getFunctionAuthHeaders();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-recommendations`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            interests: profile.interests || [],
            userId: profile.id,
          }),
        }
      );

      if (!response.ok) {
        // Fallback to regular posts for any error
        await fetchFallbackPosts();
        return;
      }

      const { recommended_ids, reason: aiReason } = await response.json();
      setReason(aiReason || 'Based on your interests');

      if (recommended_ids && recommended_ids.length > 0) {
        const { data } = await supabase
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
    const { data } = await supabase
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
      supabase.from('likes').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('bookmarks').select('post_id').eq('user_id', profile.id).in('post_id', postIds),
      supabase.from('likes').select('post_id').in('post_id', postIds),
      supabase.from('comments').select('post_id').in('post_id', postIds),
    ]);

    const likedIds = new Set(likesRes.data?.map(l => l.post_id) || []);
    const bookmarkedIds = new Set(bookmarksRes.data?.map(b => b.post_id) || []);
    
    const likeCounts: Record<string, number> = {};
    const commentCounts: Record<string, number> = {};
    
    likeCountsRes.data?.forEach(l => {
      likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
    });
    commentCountsRes.data?.forEach(c => {
      commentCounts[c.post_id] = (commentCounts[c.post_id] || 0) + 1;
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
          <Sparkles className="h-5 w-5 text-primary" />
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
