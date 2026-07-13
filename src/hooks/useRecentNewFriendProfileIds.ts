import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { mergeRecentNewFriendIds } from '@/lib/dmPreviewText';
import { ensureArray } from '@/lib/persistedCollections';

const RECENT_FRIEND_DAYS = 30;

/** Friends accepted recently — used for "Say hi 👋" on empty 1:1 threads only. */
export function useRecentNewFriendProfileIds() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['recent-new-friend-ids', profileId],
    queryFn: async (): Promise<string[]> => {
      if (!profileId) return [];

      const cutoff = new Date(Date.now() - RECENT_FRIEND_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const [sent, received] = await Promise.all([
        db
          .from('friend_requests')
          .select('sender_id, receiver_id, updated_at')
          .eq('sender_id', profileId)
          .eq('status', 'accepted')
          .gte('updated_at', cutoff),
        db
          .from('friend_requests')
          .select('sender_id, receiver_id, updated_at')
          .eq('receiver_id', profileId)
          .eq('status', 'accepted')
          .gte('updated_at', cutoff),
      ]);

      // Persist as string[] so RQ dehydrate never turns this into a plain `{}` Set corpse.
      return [...mergeRecentNewFriendIds(profileId, [
        ...(sent.data || []),
        ...(received.data || []),
      ])];
    },
    select: (data) => ensureArray<string>(data),
    enabled: !!profileId,
    staleTime: 60_000,
  });
}
