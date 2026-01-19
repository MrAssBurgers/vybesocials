import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['accepted-friend-requests', profile?.id],
    queryFn: async (): Promise<AcceptedFriendRequest[]> => {
      if (!profile?.id) return [];

      // Fetch accepted requests where current user is the sender
      // and they haven't been notified yet
      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          receiver_id,
          updated_at,
          notified_at,
          acceptedBy:profiles!friend_requests_receiver_id_fkey(id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profile.id)
        .eq('status', 'accepted')
        .is('notified_at', null)
        .order('updated_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('[AcceptedFriendRequests] Error:', error);
        return [];
      }

      return (data || []) as AcceptedFriendRequest[];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

// Dismiss an accepted friend request - marks it as notified in the database permanently
export function useDismissAcceptedRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Mark as notified in the database - this is permanent
      const { error } = await supabase
        .from('friend_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('sender_id', profile.id);

      if (error) {
        console.error('[DismissAcceptedRequest] Error:', error);
        throw error;
      }

      return requestId;
    },
    onSuccess: () => {
      // Immediately remove from cache for instant UI feedback
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}

// Hook to mark a request as notified when it's displayed (auto-dismiss after viewing)
export function useMarkRequestAsNotified() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('friend_requests')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('sender_id', profile.id);

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
