import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useSuggestedFriends } from '@/hooks/useFriendsOfFriends';
import { useFriends } from '@/hooks/useFriends';
import { useHiddenFromDiscovery } from '@/hooks/useOutgoingRequests';
import { useDismissedQuickAdd } from '@/hooks/useDismissedQuickAdd';
import { ensureStringSet } from '@/lib/persistedCollections';

export interface QuickAddUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mutual_count: number;
  subtitle: string;
}

/**
 * Unified Quick Add suggestions: mutual friends first, then interest-based fallback.
 * Always returns results even if user has no friends yet.
 */
export function useQuickAddSuggestions(limit = 8) {
  const profileId = useAuthProfileId();
  const { data: mutualSuggestions, isLoading: loadingMutual } = useSuggestedFriends();
  const { data: friends } = useFriends();
  const { data: hiddenIdsRaw } = useHiddenFromDiscovery();
  // Defensive: query persister can deserialize a Set into a plain object/array,
  // stripping `.has()`. Re-normalize on every render so the call sites never crash.
  const hiddenIds = useMemo(() => ensureStringSet(hiddenIdsRaw), [hiddenIdsRaw]);
  const { isDismissed } = useDismissedQuickAdd();

  // Fallback: interest-based / general users — ALWAYS fetched so Quick Add never empty
  const { data: generalUsers, isLoading: loadingGeneral } = useQuery({
    queryKey: ['quick-add-general', profileId, friends?.length ?? 0],
    queryFn: async (): Promise<QuickAddUser[]> => {
      if (!profileId) return [];

      const friendIds = friends?.map(f => f.id) || [];

      // Get my interests for ranking. Age filtering happens server-side so
      // other users' DOBs are never sent to the browser.
      const { data: myProfile } = await db
        .from('profiles')
        .select('interests')
        .eq('id', profileId)
        .maybeSingle();
      const myInterests = new Set<string>(
        (myProfile?.interests || []).map((i: string) => i.toLowerCase())
      );

      let users: any[] | null = null;
      const discovery = await db.functions.invoke('get-discovery-profiles', {
        body: { limit: 120 },
      });
      if (!discovery.error && Array.isArray((discovery.data as any)?.profiles)) {
        users = (discovery.data as any).profiles;
      } else {
        if (discovery.error) {
          console.warn('[QuickAdd] discovery callable unavailable; using public profile fallback', discovery.error.message);
        }
        const fallback = await db
          .from('profiles' as any)
          .select('id, username, display_name, avatar_url, interests, created_at')
          .order('created_at', { ascending: false })
          .limit(120) as any;
        users = fallback.data || null;
      }

      const friendIdSet = new Set(friendIds);

      if (!users || users.length === 0) return [];

      return (users as any[])
        .filter((u: any) => u.id !== profileId && u.username && !friendIdSet.has(u.id))
        .map((u: any) => {
          const theirInterests = (u.interests || []).map((i: string) => i.toLowerCase());
          const shared = theirInterests.filter((i: string) => myInterests.has(i));
          // Score: shared interests heavily, then profile completeness
          const score = shared.length * 4 + (u.avatar_url ? 2 : 0) + (u.display_name ? 1 : 0) + Math.random() * 0.5;
          return {
            id: u.id,
            username: u.username,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            mutual_count: 0,
            subtitle: shared.length > 0 ? shared.slice(0, 2).join(' · ') : `@${u.username}`,
            _score: score,
          };
        })
        .sort((a: any, b: any) => b._score - a._score)
        .slice(0, 30)
        .map(({ _score, ...rest }: any) => rest);
    },
    enabled: !!profileId && hiddenIds !== undefined,
    staleTime: 60000,
    gcTime: 300000,
  });

  // Merge: mutual first, then general, deduplicate
  const suggestions: QuickAddUser[] = [];
  const seenIds = new Set<string>();

  // Add mutual-based suggestions first
  for (const s of mutualSuggestions || []) {
    if (seenIds.has(s.id) || hiddenIds.has(s.id) || isDismissed(s.id)) continue;
    seenIds.add(s.id);
    suggestions.push({
      id: s.id,
      username: s.username,
      display_name: s.display_name,
      avatar_url: s.avatar_url,
      mutual_count: s.mutual_count,
      subtitle: s.mutual_count > 0
        ? `${s.mutual_count} mutual friend${s.mutual_count !== 1 ? 's' : ''}`
        : `@${s.username}`,
    });
  }

  // Fill with general suggestions
  for (const u of generalUsers || []) {
    if (seenIds.has(u.id) || hiddenIds.has(u.id) || isDismissed(u.id)) continue;
    seenIds.add(u.id);
    suggestions.push(u);
  }

  return {
    suggestions: suggestions.slice(0, limit),
    isLoading: loadingMutual || loadingGeneral,
  };
}
