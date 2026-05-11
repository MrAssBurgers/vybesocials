import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface LandingCreator {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
}

/**
 * Top public + opted-in creators by 24h engagement (views + likes + comments).
 * Powers the avatar stack on the public /vybe-home landing page.
 * Refreshes hourly so new traction surfaces throughout the day.
 */
export function useLandingTopCreators(limit = 4) {
  return useQuery<LandingCreator[]>({
    queryKey: ['landing-top-creators', limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_landing_top_creators', { _limit: limit });
      if (error) {
        console.warn('[landing-top-creators] rpc failed', error);
        return [];
      }
      return (data ?? []) as LandingCreator[];
    },
    staleTime: 60 * 60 * 1000, // 1 hour
    refetchInterval: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
