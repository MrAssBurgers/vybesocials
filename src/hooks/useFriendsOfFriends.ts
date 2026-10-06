import { useQuery } from '@tanstack/react-query';
import { usePeopleDiscovery } from './usePeopleDiscovery';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

/**
 * Get mutual friends between current user and target user.
 * Friends = accepted friend_requests where either sender or receiver is the user.
 */
export function useMutualFriends(targetUserId?: string) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['mutual-friends', profileId, targetUserId],
    queryFn: async () => {
      if (!profileId || !targetUserId || profileId === targetUserId) return [];

      const { data: myFriends } = await db
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`);

      const myFriendIds = new Set(
        (myFriends || []).map(f => f.sender_id === profileId ? f.receiver_id : f.sender_id)
      );

      // Get target user's friends
      const { data: theirFriends } = await db
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${targetUserId},receiver_id.eq.${targetUserId}`);

      const theirFriendIds = new Set(
        (theirFriends || []).map(f => f.sender_id === targetUserId ? f.receiver_id : f.sender_id)
      );

      // Intersection
      const mutualIds = [...myFriendIds].filter(id => theirFriendIds.has(id));

      if (mutualIds.length === 0) return [];

      // Fetch profiles for mutual friends
      const { data: profiles } = await db
        .from('profiles')
        .select('id, username, display_name, avatar_url, is_verified')
        .in('id', mutualIds.slice(0, 10));

      return profiles || [];
    },
    enabled: !!profileId && !!targetUserId && profileId !== targetUserId,
    staleTime: 60000,
  });
}

/**
 * Get count of mutual friends (lightweight version)
 */
export function useMutualFriendsCount(targetUserId?: string) {
  const { data } = useMutualFriends(targetUserId);
  return data?.length || 0;
}

/**
 * Get suggested friends (friends of friends who aren't already your friends)
 * — age-filtered by the server without returning DOBs to the browser.
 */
export function useSuggestedFriends() {
  const discovery = usePeopleDiscovery();
  return { ...discovery, data: discovery.data?.profiles.filter(profile => profile.mutual_count > 0).sort((a, b) => b.mutual_count - a.mutual_count).slice(0, 15),
    ageReviewRequired: discovery.data?.ageReviewRequired ?? false };
}
/**
 * Check if friends of friends are attending a specific event
 */
export function useFriendsAtEvent(eventId?: string) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['friends-at-event', profileId, eventId],
    queryFn: async () => {
      if (!profileId || !eventId) return { friends: [], fof: [] };

      const { data: myFriends } = await db
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`);

      const myFriendIds = new Set(
        (myFriends || []).map(f => f.sender_id === profileId ? f.receiver_id : f.sender_id)
      );

      // Get event attendees
      const { data: rsvps } = await db
        .from('event_rsvps')
        .select(`
          user_id,
          status,
          user:profiles!user_id (
            id, username, display_name, avatar_url
          )
        `)
        .eq('event_id', eventId)
        .in('status', ['going', 'interested']);

      const friends = (rsvps || []).filter(r => myFriendIds.has(r.user_id));
      
      // FoF at event (users who are friends with your friends but not you)
      const attendeeIds = new Set((rsvps || []).map(r => r.user_id));
      const fofAtEvent: typeof rsvps = [];

      for (const friendId of [...myFriendIds]) {
        const { data: theirFriends } = await db
          .from('friend_requests')
          .select('sender_id, receiver_id')
          .eq('status', 'accepted')
          .or(`sender_id.eq.${friendId},receiver_id.eq.${friendId}`)
          .limit(50);

        for (const f of theirFriends || []) {
          const fofId = f.sender_id === friendId ? f.receiver_id : f.sender_id;
          if (myFriendIds.has(fofId) || fofId === profileId) continue;
          if (attendeeIds.has(fofId)) {
            const rsvp = (rsvps || []).find(r => r.user_id === fofId);
            if (rsvp && !fofAtEvent.some(e => e.user_id === fofId)) {
              fofAtEvent.push(rsvp);
            }
          }
        }
      }

      return { friends, fof: fofAtEvent };
    },
    enabled: !!profileId && !!eventId,
    staleTime: 60000,
  });
}
