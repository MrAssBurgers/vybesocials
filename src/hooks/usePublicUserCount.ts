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
      const { data, error } = await (supabase as any).rpc('get_public_user_count');
      if (error) {
        const code = (error as { code?: string }).code;
        const msg = error.message || '';
        // RPC missing on preview DB or not migrated yet — fail soft, no console spam.
        if (
          code === 'PGRST202' ||
          code === '42883' ||
          /could not find the function/i.test(msg) ||
          /404/.test(msg)
        ) {
          return null;
        }
        throw error;
      }
      return Number(data ?? 0);
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
