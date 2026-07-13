import { useMemo } from 'react';
import { useCloseFriends } from '@/hooks/useStories';

/** Set of close-friend profile IDs for the signed-in user. */
export function useCloseFriendIds(): Set<string> {
  const { data } = useCloseFriends();
  return useMemo(() => {
    const ids = new Set<string>();
    for (const row of data || []) {
      const friend = (row as { friend?: { id?: string } | null }).friend;
      if (friend?.id) ids.add(String(friend.id));
    }
    return ids;
  }, [data]);
}
