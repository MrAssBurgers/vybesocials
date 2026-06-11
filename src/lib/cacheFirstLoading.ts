/**
 * Cache-first loading helpers — show stale content immediately, skeleton only when empty.
 */

/** Skeleton only when there is zero content and the query has not resolved yet. */
export function shouldShowFeedSkeleton(
  postCount: number,
  isPending: boolean,
  isFetchingNext = false,
): boolean {
  return postCount === 0 && isPending && !isFetchingNext;
}

/** Subtle refresh indicator when cached posts are visible and a background fetch runs. */
export function shouldShowFeedRefreshing(
  postCount: number,
  isFetching: boolean,
  isPending: boolean,
): boolean {
  return postCount > 0 && isFetching && !isPending;
}

/** Combined pending for merged feeds (e.g. For You + Following). */
export function mergedFeedPending(
  postCount: number,
  pendingFlags: boolean[],
): boolean {
  if (postCount > 0) return false;
  return pendingFlags.some(Boolean);
}
