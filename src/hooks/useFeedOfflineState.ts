import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/** Feed-specific offline helpers for empty vs cached states. */
export function useFeedOfflineState(postCount: number) {
  const { isOnline } = useNetworkStatus();
  const hasPosts = postCount > 0;

  return {
    isOnline,
    isOfflineWithCache: !isOnline && hasPosts,
    isOfflineNoCache: !isOnline && !hasPosts,
    showCachedBanner: !isOnline && hasPosts,
  };
}
