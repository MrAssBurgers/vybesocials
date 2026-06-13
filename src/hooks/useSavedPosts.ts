import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export function useSavedPosts() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['saved-posts', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // First get bookmarked post IDs
      const { data: bookmarks, error: bookmarksError } = await supabase
        .from('bookmarks')
        .select('post_id')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false });

      if (bookmarksError) throw bookmarksError;
      if (!bookmarks || bookmarks.length === 0) return [];

      const postIds = bookmarks.map(b => b.post_id);

      // Then fetch the posts with author info
      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select(`
          *,
          author:profiles!posts_author_id_fkey(id, username, avatar_url)
        `)
        .in('id', postIds);

      if (postsError) throw postsError;

      // Get like and comment counts
      const postsWithCounts = await Promise.all(
        (posts || []).map(async (post) => {
          const [{ count: likeCount }, { count: commentCount }] = await Promise.all([
            supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
            supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', post.id),
          ]);

          return {
            ...post,
            like_count: likeCount || 0,
            comment_count: commentCount || 0,
          };
        })
      );

      // Sort by bookmark order
      return postsWithCounts.sort((a, b) => {
        const aIndex = postIds.indexOf(a.id);
        const bIndex = postIds.indexOf(b.id);
        return aIndex - bIndex;
      });
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}
