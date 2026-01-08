import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface UserWithMutualFriends {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  mutual_friends_count: number;
  mutual_friends: {
    id: string;
    username: string;
    avatar_url: string | null;
  }[];
}

export function useMutualFriends() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['suggested-with-mutuals', profile?.id],
    queryFn: async (): Promise<UserWithMutualFriends[]> => {
      if (!profile?.id) return [];

      // First get current user's friends
      const { data: myFriendsAsSender } = await supabase
        .from('friend_requests')
        .select('receiver_id')
        .eq('sender_id', profile.id)
        .eq('status', 'accepted');

      const { data: myFriendsAsReceiver } = await supabase
        .from('friend_requests')
        .select('sender_id')
        .eq('receiver_id', profile.id)
        .eq('status', 'accepted');

      const myFriendIds = new Set([
        ...(myFriendsAsSender || []).map(f => f.receiver_id),
        ...(myFriendsAsReceiver || []).map(f => f.sender_id),
      ]);

      if (myFriendIds.size === 0) return [];

      // Get friends of friends (potential suggestions)
      const friendIdsArray = Array.from(myFriendIds);
      
      // For each of my friends, get their friends
      const { data: fofAsSender } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .in('sender_id', friendIdsArray)
        .eq('status', 'accepted');

      const { data: fofAsReceiver } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .in('receiver_id', friendIdsArray)
        .eq('status', 'accepted');

      // Build map: userId -> which of my friends are connected to them
      const mutualMap = new Map<string, Set<string>>();

      (fofAsSender || []).forEach(f => {
        const potentialUserId = f.receiver_id;
        if (potentialUserId !== profile.id && !myFriendIds.has(potentialUserId)) {
          if (!mutualMap.has(potentialUserId)) {
            mutualMap.set(potentialUserId, new Set());
          }
          mutualMap.get(potentialUserId)!.add(f.sender_id);
        }
      });

      (fofAsReceiver || []).forEach(f => {
        const potentialUserId = f.sender_id;
        if (potentialUserId !== profile.id && !myFriendIds.has(potentialUserId)) {
          if (!mutualMap.has(potentialUserId)) {
            mutualMap.set(potentialUserId, new Set());
          }
          mutualMap.get(potentialUserId)!.add(f.receiver_id);
        }
      });

      // Get profiles for suggestions with at least 1 mutual friend
      const suggestedIds = Array.from(mutualMap.keys()).slice(0, 20);
      if (suggestedIds.length === 0) return [];

      const { data: suggestedProfiles } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', suggestedIds);

      // Get mutual friend profiles
      const allMutualIds = new Set<string>();
      mutualMap.forEach(set => set.forEach(id => allMutualIds.add(id)));
      
      const { data: mutualProfiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', Array.from(allMutualIds));

      const mutualProfileMap = new Map(
        (mutualProfiles || []).map(p => [p.id, p])
      );

      // Build result
      const result: UserWithMutualFriends[] = (suggestedProfiles || [])
        .map(p => {
          const mutualIds = Array.from(mutualMap.get(p.id) || []);
          return {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            avatar_url: p.avatar_url,
            mutual_friends_count: mutualIds.length,
            mutual_friends: mutualIds
              .slice(0, 3)
              .map(id => mutualProfileMap.get(id))
              .filter((x): x is NonNullable<typeof x> => !!x),
          };
        })
        .sort((a, b) => b.mutual_friends_count - a.mutual_friends_count);

      return result;
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}
