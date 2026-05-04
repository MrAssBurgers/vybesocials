import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Public, unauthenticated count of total profiles.
 * Used on the marketing page hero — never inflate or fake this number.
 */
export function usePublicUserCount() {
  return useQuery({
    queryKey: ['public-user-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
