import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const PIN_LIMIT = 3;

/**
 * Returns the number of pinned posts for a given author.
 * Used to enforce the per-user pin cap (PIN_LIMIT).
 */
export function usePinnedPostCount(authorId?: string) {
  return useQuery({
    queryKey: ['pinned-post-count', authorId],
    queryFn: async (): Promise<number> => {
      if (!authorId) return 0;
      const { count, error } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('author_id', authorId)
        .eq('is_pinned', true);
      if (error) {
        console.warn('[usePinnedPostCount] failed', error);
        return 0;
      }
      return count || 0;
    },
    enabled: !!authorId,
    staleTime: 60 * 1000,
  });
}
