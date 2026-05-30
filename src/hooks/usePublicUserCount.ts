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
      const { data, error } = await supabase.rpc('get_public_user_count');
      if (error) {
        // RPC missing until migration is applied — don't treat as zero members.
        if (/could not find the function/i.test(error.message)) {
          throw new Error('PUBLIC_USER_COUNT_RPC_MISSING');
        }
        throw error;
      }
      return Number(data ?? 0);
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'PUBLIC_USER_COUNT_RPC_MISSING') {
        return false;
      }
      return failureCount < 2;
    },
  });
}
