import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface AcceptedFriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  updated_at: string;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

// Fetch recently accepted friend requests (where current user was the sender)
export function useAcceptedFriendRequests() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['accepted-friend-requests', profile?.id],
    queryFn: async (): Promise<AcceptedFriendRequest[]> => {
      if (!profile?.id) return [];

      // Get dismissed IDs from localStorage
      const dismissedKey = `vybe_dismissed_accepted_requests_${profile.id}`;
      const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');

      // Get recently accepted requests where we were the sender (within last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('friend_requests')
        .select(`
          id,
          sender_id,
          receiver_id,
          updated_at,
          sender:profiles!friend_requests_receiver_id_fkey(id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profile.id)
        .eq('status', 'accepted')
        .gte('updated_at', sevenDaysAgo.toISOString())
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[AcceptedFriendRequests] Error:', error);
        return [];
      }

      // Filter out dismissed ones
      const filtered = (data || []).filter(r => !dismissed.includes(r.id));

      return filtered as AcceptedFriendRequest[];
    },
    enabled: !!profile?.id,
    staleTime: 60000,
  });
}

export function useDismissAcceptedRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const dismissedKey = `vybe_dismissed_accepted_requests_${profile.id}`;
      const dismissed = JSON.parse(localStorage.getItem(dismissedKey) || '[]');
      dismissed.push(requestId);
      localStorage.setItem(dismissedKey, JSON.stringify(dismissed));

      return requestId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}
