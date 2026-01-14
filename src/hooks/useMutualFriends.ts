import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface UserWithMutualFriends {
  id: string;
  username: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  mutual_friends_count: number;
  mutual_friends: {
    id: string;
    username: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  }[];
}

export function useMutualFriends() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['suggested-with-mutuals', profile?.id],
    queryFn: async (): Promise<UserWithMutualFriends[]> => {
      if (!profile?.id) return [];

      try {
        // First get current user's friends (accepted friend requests) - parallel fetch
        const [senderResult, receiverResult] = await Promise.all([
          supabase
            .from('friend_requests')
            .select('receiver_id')
            .eq('sender_id', profile.id)
            .eq('status', 'accepted'),
          supabase
            .from('friend_requests')
            .select('sender_id')
            .eq('receiver_id', profile.id)
            .eq('status', 'accepted'),
        ]);

        const myFriendIds = new Set([
          ...(senderResult.data || []).map(f => f.receiver_id),
          ...(receiverResult.data || []).map(f => f.sender_id),
        ]);

        if (myFriendIds.size === 0) return [];

        // Get friends of friends (potential suggestions) - parallel fetch
        const friendIdsArray = Array.from(myFriendIds);
        
        const [fofSenderResult, fofReceiverResult] = await Promise.all([
          supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .in('sender_id', friendIdsArray)
            .eq('status', 'accepted'),
          supabase
            .from('friend_requests')
            .select('sender_id, receiver_id')
            .in('receiver_id', friendIdsArray)
            .eq('status', 'accepted'),
        ]);

        // Build map: userId -> which of my friends are connected to them
        const mutualMap = new Map<string, Set<string>>();

        (fofSenderResult.data || []).forEach(f => {
          const potentialUserId = f.receiver_id;
          if (potentialUserId !== profile.id && !myFriendIds.has(potentialUserId)) {
            if (!mutualMap.has(potentialUserId)) {
              mutualMap.set(potentialUserId, new Set());
            }
            mutualMap.get(potentialUserId)!.add(f.sender_id);
          }
        });

        (fofReceiverResult.data || []).forEach(f => {
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
          .select('id, username, display_name, first_name, last_name, avatar_url')
          .in('id', suggestedIds);

        // Get mutual friend profiles
        const allMutualIds = new Set<string>();
        mutualMap.forEach(set => set.forEach(id => allMutualIds.add(id)));
        
        const { data: mutualProfiles } = await supabase
          .from('profiles')
          .select('id, username, first_name, last_name, avatar_url')
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
              first_name: p.first_name,
              last_name: p.last_name,
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
      } catch (error) {
        console.error('[useMutualFriends] Error fetching mutual friends:', error);
        return [];
      }
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}
