import { useMemo } from 'react';
import { useCloseFriends } from './useStories';

/** Current-account grants only; failed/private snapshots are never placeholders. */
export function useCloseFriendIds() {
  const query = useCloseFriends();
  const ids = useMemo(() => new Set((query.data || []).map(row => row.friend.id)), [query.data]);
  return { ids, isLoading: query.isLoading, isFetched: query.isFetched };
}
