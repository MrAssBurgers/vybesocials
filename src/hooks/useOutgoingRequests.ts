import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { normalizePersistedSet } from '@/lib/persistedCollections';

/**
 * Hook to get all user IDs that have pending outgoing friend requests
 * These users should be hidden from discovery (Snapchat-style)
 */
export function useOutgoingRequestUserIds() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['outgoing-request-ids', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await db
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', profileId)
        .eq('status', 'pending');

      if (error) {
        console.error('[useOutgoingRequestUserIds] Error:', error);
        return new Set<string>();
      }

      return new Set(data.map(d => d.receiver_id));
    },
    enabled: !!profileId,
    staleTime: 1000 * 30, // 30 seconds
    networkMode: 'always',
    select: normalizePersistedSet,
  });
}

/**
 * Hook to get all user IDs that should be hidden from discovery
 * Includes: outgoing requests, dismissed profiles, blocked users, existing friends
 */
export function useHiddenFromDiscovery() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['hidden-from-discovery', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      // Fetch all in parallel for performance
      const [
        outgoingResult,
        dismissedResult,
        blockedResult,
        friendsResult
      ] = await Promise.all([
        // Outgoing pending requests
        db
          .from('friend_requests')
          .select('receiver_id')
          .eq('sender_id', profileId)
          .eq('status', 'pending'),
        
        // Dismissed profiles
        db
          .from('dismissed_profiles')
          .select('dismissed_user_id')
          .eq('user_id', profileId),
        
        // Blocked users (both directions)
        db
          .from('blocked_users')
          .select('blocked_id, blocker_id')
          .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`),
        
        // Existing friends (accepted requests)
        db
          .from('friend_requests')
          .select('sender_id, receiver_id')
          .eq('status', 'accepted')
          .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`)
      ]);

      const hiddenIds = new Set<string>();

      // Add outgoing request recipients
      outgoingResult.data?.forEach(d => hiddenIds.add(d.receiver_id));

      // Add dismissed users
      dismissedResult.data?.forEach(d => hiddenIds.add(d.dismissed_user_id));

      // Add blocked users
      blockedResult.data?.forEach(d => {
        if (d.blocker_id === profileId) {
          hiddenIds.add(d.blocked_id);
        } else {
          hiddenIds.add(d.blocker_id);
        }
      });

      // Add existing friends
      friendsResult.data?.forEach(d => {
        if (d.sender_id === profileId) {
          hiddenIds.add(d.receiver_id);
        } else {
          hiddenIds.add(d.sender_id);
        }
      });

      return hiddenIds;
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 1000 * 30,
    select: normalizePersistedSet,
  });
}
