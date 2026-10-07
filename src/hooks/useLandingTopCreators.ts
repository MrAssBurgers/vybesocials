import { useQuery } from '@tanstack/react-query';

export interface LandingCreator {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  score: number;
}

/**
 * Featured creators on the public marketing page.
 * `get_landing_top_creators` is not a deployed reader, and profile documents
 * are not public, so the avatar stack stays empty instead of calling it.
 */
export function useLandingTopCreators(limit = 4) {
  return useQuery<LandingCreator[]>({
    queryKey: ['landing-top-creators', limit],
    queryFn: async () => [],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
