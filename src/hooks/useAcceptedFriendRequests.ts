import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ensureArray } from '@/lib/persistedCollections';
import { toast } from 'sonner';

const DISMISSED_ACCEPTED_KEY = 'vybe-dismissed-accepted-requests';

function readDismissedAcceptedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_ACCEPTED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistDismissedAcceptedId(requestId: string) {
  try {
    const ids = readDismissedAcceptedIds();
    ids.add(requestId);
    localStorage.setItem(DISMISSED_ACCEPTED_KEY, JSON.stringify([...ids].slice(-100)));
  } catch {
    // ignore quota errors
  }
}

interface AcceptedFriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  updated_at: string;
  notified_at: string | null;
  // The person who accepted the request (the receiver)
  acceptedBy?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

// Fetch recently accepted friend requests where:
// - Current user was the SENDER (they sent the request)
// - The request was ACCEPTED by the receiver
// - The sender hasn't been notified yet (notified_at IS NULL)
// This shows "X accepted your friend request!" notifications
export function useAcceptedFriendRequests() {
  const profileId = useAuthProfileId();

  const query = useQuery({
    queryKey: ['accepted-friend-requests', profileId],
    queryFn: async (): Promise<AcceptedFriendRequest[]> => {
      if (!profileId) return [];

      // Fetch accepted requests where current user is the sender
      // and they haven't been notified yet
      const { data, error } = await db
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          receiver_id,
          updated_at,
          notified_at
        `)
        .eq('sender_id', profileId)
        .eq('status', 'accepted')
        .is('notified_at', null)
        .limit(20);

      if (error) {
        console.error('[AcceptedFriendRequests] Error:', error);
        return [];
      }

      const receiverIds = [...new Set((data || []).map((r) => r.receiver_id).filter(Boolean))];
      const profileMap = new Map<string, Record<string, unknown>>();
      for (let i = 0; i < receiverIds.length; i += 10) {
        const chunk = receiverIds.slice(i, i + 10);
        const { data: profiles } = await db
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .in('id', chunk);
        for (const p of profiles || []) profileMap.set(p.id, p);
      }

      const dismissed = readDismissedAcceptedIds();
      return ((data || []) as AcceptedFriendRequest[])
        .map((row) => ({
          ...row,
          acceptedBy: profileMap.get(row.receiver_id) as AcceptedFriendRequest['acceptedBy'],
        }))
        .filter((row) => !dismissed.has(row.id))
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 5);
    },
    enabled: !!profileId,
    staleTime: 30000,
    refetchOnWindowFocus: true,
    networkMode: 'always',
    select: (data) => ensureArray<AcceptedFriendRequest>(data),
  });

  return {
    ...query,
    data: ensureArray<AcceptedFriendRequest>(query.data),
  };
}

// Dismiss an accepted friend request - marks it as notified in the database permanently
export function useDismissAcceptedRequest() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      persistDismissedAcceptedId(requestId);

      const { error } = await db
        .from('friend_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('sender_id', profileId);

      if (error) {
        console.warn('[DismissAcceptedRequest] DB update failed (local dismiss kept):', error);
      }

      return requestId;
    },
    onMutate: async (requestId) => {
      persistDismissedAcceptedId(requestId);
      await queryClient.cancelQueries({ queryKey: ['accepted-friend-requests'] });
      const previous = queryClient.getQueryData<AcceptedFriendRequest[]>(['accepted-friend-requests', profileId]);
      queryClient.setQueryData<AcceptedFriendRequest[]>(
        ['accepted-friend-requests', profileId],
        (old) => (old || []).filter((row) => row.id !== requestId),
      );
      return { previous };
    },
    onError: () => {
      toast.error('Could not sync dismiss — hidden on this device');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}

// Hook to mark a request as notified when it's displayed (auto-dismiss after viewing)
export function useMarkRequestAsNotified() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await db
        .from('friend_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('sender_id', profileId);

      if (error) {
        console.error('[MarkRequestAsNotified] Error:', error);
        throw error;
      }

      return requestId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}
