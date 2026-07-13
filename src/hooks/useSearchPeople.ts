import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';

export interface SearchPeopleResult {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

/** Username / display-name search — shared by global Search and Add Friends. */
export function useSearchPeople(query: string) {
  return useQuery({
    queryKey: ['search-people', query],
    queryFn: async (): Promise<SearchPeopleResult[]> => {
      if (!query || query.length < 2) return [];
      const { data, error } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .limit(30);
      if (error) throw error;
      const rows = data || [];
      const byUsername = new Map<string, SearchPeopleResult>();
      for (const row of rows) {
        const key = String(row.username || row.id).toLowerCase();
        if (!byUsername.has(key)) byUsername.set(key, row);
      }
      return Array.from(byUsername.values());
    },
    enabled: query.length >= 2,
    networkMode: 'always',
    staleTime: 1000 * 60 * 5,
    placeholderData: (prev) => prev,
  });
}
