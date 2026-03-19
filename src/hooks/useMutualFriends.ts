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
  affinity_score: number; // Combined ranking score
  shared_interests: string[];
  is_recently_active: boolean;
}

/**
 * Get all user IDs that should be hidden from discovery
 * Snapchat-style: hide pending outgoing, dismissed, blocked, and already friends
 */
async function getHiddenUserIds(profileId: string): Promise<Set<string>> {
  const [outgoingResult, dismissedResult, blockedResult, friendsResult] = await Promise.all([
    supabase
      .from('friend_requests')
      .select('receiver_id')
      .eq('sender_id', profileId)
      .eq('status', 'pending'),
    supabase
      .from('dismissed_profiles')
      .select('dismissed_user_id')
      .eq('user_id', profileId),
    supabase
      .from('blocked_users')
      .select('blocked_id, blocker_id')
      .or(`blocker_id.eq.${profileId},blocked_id.eq.${profileId}`),
    supabase
      .from('friend_requests')
      .select('sender_id, receiver_id')
      .eq('status', 'accepted')
      .or(`sender_id.eq.${profileId},receiver_id.eq.${profileId}`),
  ]);

  const hiddenIds = new Set<string>();
  outgoingResult.data?.forEach(d => hiddenIds.add(d.receiver_id));
  dismissedResult.data?.forEach(d => hiddenIds.add(d.dismissed_user_id));
  blockedResult.data?.forEach(d => {
    hiddenIds.add(d.blocker_id === profileId ? d.blocked_id : d.blocker_id);
  });
  friendsResult.data?.forEach(d => {
    hiddenIds.add(d.sender_id === profileId ? d.receiver_id : d.sender_id);
  });
  return hiddenIds;
}

/**
 * Multi-signal friend suggestion algorithm.
 *
 * Signals (weighted):
 * 1. Mutual friends count        ×10  — social proximity
 * 2. Shared interests             ×6  — vibe alignment (DNA)
 * 3. Interaction affinity         ×8  — boosts FoFs via friends you interact with most
 * 4. Recent activity              ×3  — active users > dormant
 * 5. Profile completeness         ×1  — small tiebreaker for quality
 * 6. Freshness jitter           ±0-2  — prevents stale ordering across sessions
 */
export function useMutualFriends() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['suggested-with-mutuals', profile?.id],
    queryFn: async (): Promise<UserWithMutualFriends[]> => {
      if (!profile?.id) return [];

      try {
        const hiddenIds = await getHiddenUserIds(profile.id);

        // 1. Get my friends
        const [senderResult, receiverResult] = await Promise.all([
          supabase.from('friend_requests').select('receiver_id').eq('sender_id', profile.id).eq('status', 'accepted'),
          supabase.from('friend_requests').select('sender_id').eq('receiver_id', profile.id).eq('status', 'accepted'),
        ]);
        const myFriendIds = new Set([
          ...(senderResult.data || []).map(f => f.receiver_id),
          ...(receiverResult.data || []).map(f => f.sender_id),
        ]);
        if (myFriendIds.size === 0) return [];

        // 2. Get my profile interests for matching
        const { data: myProfile } = await supabase
          .from('profiles')
          .select('interests')
          .eq('id', profile.id)
          .maybeSingle();
        const myInterests = new Set<string>(
          (myProfile?.interests || []).map((i: string) => i.toLowerCase())
        );

        // 3. Get interaction affinity — which friends do I talk to / like most (last 30d)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
        const friendAffinityMap = new Map<string, number>();

        // Recent DMs sent to friends — use messages table directly
        const { data: recentDMs } = await supabase
          .from('messages')
          .select('conversation_id')
          .eq('sender_id', profile.id)
          .gte('created_at', thirtyDaysAgo)
          .limit(200);

        if (recentDMs && recentDMs.length > 0) {
          // Count conversations as proxy for interaction frequency
          const convCounts = new Map<string, number>();
          recentDMs.forEach(m => convCounts.set(m.conversation_id, (convCounts.get(m.conversation_id) || 0) + 1));

          // For each conversation, get the other participants
          const convIds = [...convCounts.keys()].slice(0, 50);
          for (const convId of convIds) {
            const { data: participants } = await (supabase
              .from('conversation_participants' as any)
              .select('user_id')
              .eq('conversation_id', convId)
              .neq('user_id', profile.id) as any);

            ((participants as any[]) || []).forEach((cp: any) => {
              if (myFriendIds.has(cp.user_id)) {
                const weight = convCounts.get(convId) || 1;
                friendAffinityMap.set(cp.user_id, (friendAffinityMap.get(cp.user_id) || 0) + weight);
              }
            });
          }
        }

        // Recent likes on friends' posts
        const { data: recentLikes } = await supabase
          .from('likes')
          .select('post_id, posts!inner(user_id)')
          .eq('user_id', profile.id)
          .gte('created_at', thirtyDaysAgo)
          .limit(100);

        (recentLikes || []).forEach((l: any) => {
          const postAuthor = l.posts?.user_id;
          if (postAuthor && myFriendIds.has(postAuthor)) {
            friendAffinityMap.set(postAuthor, (friendAffinityMap.get(postAuthor) || 0) + 2);
          }
        });

        // Normalize affinity 0-1
        const maxAffinity = Math.max(1, ...friendAffinityMap.values());

        // 4. Get friends-of-friends
        const friendIdsArray = Array.from(myFriendIds);
        const [fofSenderResult, fofReceiverResult] = await Promise.all([
          supabase.from('friend_requests').select('sender_id, receiver_id').in('sender_id', friendIdsArray).eq('status', 'accepted'),
          supabase.from('friend_requests').select('sender_id, receiver_id').in('receiver_id', friendIdsArray).eq('status', 'accepted'),
        ]);

        // Build: candidateId → { viaFriends, totalAffinity }
        const candidateMap = new Map<string, { viaFriends: Set<string>; affinitySum: number }>();

        const processFoF = (potentialId: string, viaFriendId: string) => {
          if (potentialId === profile.id || myFriendIds.has(potentialId) || hiddenIds.has(potentialId)) return;
          if (!candidateMap.has(potentialId)) {
            candidateMap.set(potentialId, { viaFriends: new Set(), affinitySum: 0 });
          }
          const entry = candidateMap.get(potentialId)!;
          entry.viaFriends.add(viaFriendId);
          entry.affinitySum += (friendAffinityMap.get(viaFriendId) || 0) / maxAffinity;
        };

        (fofSenderResult.data || []).forEach(f => processFoF(f.receiver_id, f.sender_id));
        (fofReceiverResult.data || []).forEach(f => processFoF(f.sender_id, f.receiver_id));

        // 5. Fetch candidate profiles + interests + activity
        const candidateIds = Array.from(candidateMap.keys()).slice(0, 40);
        if (candidateIds.length === 0) return [];

        const { data: candidateProfiles } = await (supabase
          .from('profiles' as any)
          .select('id, username, display_name, first_name, last_name, avatar_url, interests')
          .in('id', candidateIds) as any);

        // 6. Fetch mutual friend profiles for display
        const allMutualIds = new Set<string>();
        candidateMap.forEach(v => v.viaFriends.forEach(id => allMutualIds.add(id)));
        const { data: mutualProfiles } = await supabase
          .from('public_profiles')
          .select('id, username, first_name, last_name, avatar_url')
          .in('id', Array.from(allMutualIds));
        const mutualProfileMap = new Map((mutualProfiles || []).map(p => [p.id, p]));

        // 7. Score and rank
        const now = Date.now();
        const jitterSeed = Math.floor(now / 3600000); // Changes hourly

        const results: UserWithMutualFriends[] = (candidateProfiles || []).map(p => {
          const entry = candidateMap.get(p.id)!;
          const mutualCount = entry.viaFriends.size;

          // Interest overlap
          const theirInterests = (p.interests || []).map((i: string) => i.toLowerCase());
          const shared = theirInterests.filter((i: string) => myInterests.has(i));

          // Activity recency (last_seen within 7 days = active)
          const lastSeen = p.last_seen ? new Date(p.last_seen).getTime() : 0;
          const daysSinceActive = (now - lastSeen) / 86400000;
          const isRecentlyActive = daysSinceActive < 7;
          const activityScore = daysSinceActive < 1 ? 1 : daysSinceActive < 3 ? 0.7 : daysSinceActive < 7 ? 0.4 : 0.1;

          // Profile completeness (has avatar + bio-like fields)
          const completeness = (p.avatar_url ? 0.5 : 0) + (p.display_name ? 0.25 : 0) + (theirInterests.length > 0 ? 0.25 : 0);

          // Deterministic jitter per user (changes hourly)
          const jitter = ((hashCode(p.id + jitterSeed) % 200) - 100) / 100; // -1 to 1

          // Weighted score
          const score =
            mutualCount * 10 +
            shared.length * 6 +
            (entry.affinitySum / Math.max(1, mutualCount)) * 8 +
            activityScore * 3 +
            completeness * 1 +
            jitter * 2;

          const mutualIds = Array.from(entry.viaFriends);

          return {
            id: p.id,
            username: p.username,
            display_name: p.display_name,
            first_name: p.first_name,
            last_name: p.last_name,
            avatar_url: p.avatar_url,
            mutual_friends_count: mutualCount,
            mutual_friends: mutualIds.slice(0, 3).map(id => mutualProfileMap.get(id)).filter(Boolean) as any,
            affinity_score: Math.round(score * 100) / 100,
            shared_interests: shared,
            is_recently_active: isRecentlyActive,
          };
        });

        results.sort((a, b) => b.affinity_score - a.affinity_score);
        return results;
      } catch (error) {
        console.error('[useMutualFriends] Error:', error);
        return [];
      }
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}

/** Simple string hash for deterministic jitter */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
