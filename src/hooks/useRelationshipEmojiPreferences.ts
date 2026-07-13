import { useQuery } from '@tanstack/react-query';
import { getDocument } from '@/lib/firebase/firestoreDb';
import { invokeFunction } from '@/lib/firebase/functionsService';
import type { RelationshipEmojiPreferences } from '@/lib/relationship/relationshipEmojiMap';

export function useRelationshipEmojiPreferences(viewerId?: string | null) {
  return useQuery({
    queryKey: ['friendship-emoji-prefs', viewerId],
    queryFn: async (): Promise<RelationshipEmojiPreferences> => {
      if (!viewerId) return {};
      const doc = await getDocument<RelationshipEmojiPreferences>(
        'friendship_emoji_preferences',
        viewerId,
      );
      return doc || {};
    },
    enabled: Boolean(viewerId),
    staleTime: 60_000,
  });
}

export async function saveRelationshipEmojiPreferences(
  prefs: Partial<RelationshipEmojiPreferences>,
): Promise<void> {
  await invokeFunction('updateFriendshipEmojiPreferences', prefs);
}

export async function pinFavoriteFriend(friendId: string): Promise<void> {
  await invokeFunction('pinFavoriteFriend', { friend_id: friendId });
}

export async function updateFriendshipPreferences(patch: {
  show_cooling_down?: boolean;
  pinned_friend_id?: string | null;
}): Promise<void> {
  await invokeFunction('updateFriendshipPreferences', patch);
}
