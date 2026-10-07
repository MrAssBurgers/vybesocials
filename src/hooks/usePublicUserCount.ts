import { useQuery } from '@tanstack/react-query';

/**
 * Marketing-page member count.
 * Profile documents are not publicly readable, and there is no public counter,
 * so this stays empty instead of listing every profile. Never invent a number.
 */
export function usePublicUserCount() {
  return useQuery<number | null>({
    queryKey: ['public-user-count'],
    queryFn: async () => null,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
