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

// Permanent localStorage key for dismissed requests
const DISMISSED_STORAGE_KEY = 'vybe_dismissed_friend_requests';

// Get permanently dismissed request IDs from localStorage
function getDismissedRequests(): Set<string> {
  try {
    const stored = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch {}
  return new Set();
}

// Save dismissed request to localStorage permanently
function saveDismissedRequest(requestId: string) {
  try {
    const dismissed = getDismissedRequests();
    dismissed.add(requestId);
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify([...dismissed]));
  } catch {}
}

// Fetch recently accepted friend requests (where current user was the sender)
// Shows only ONE request at a time
export function useAcceptedFriendRequests() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['accepted-friend-requests', profile?.id],
    queryFn: async (): Promise<AcceptedFriendRequest[]> => {
      if (!profile?.id) return [];

      // Get recently accepted requests where we were the sender (within last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('[AcceptedFriendRequests] Error:', error);
        return [];
      }

      // Get dismissed IDs from localStorage
      const dismissedIds = getDismissedRequests();

      // Filter out permanently dismissed ones and return only the first one
      const filtered = (data || []).filter(r => !dismissedIds.has(r.id));

      // Only show ONE friend request at a time
      return filtered.slice(0, 1) as AcceptedFriendRequest[];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
}

export function useDismissAcceptedRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Permanently dismiss this request
      saveDismissedRequest(requestId);

      return requestId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}

// Hook to clear all dismissed requests (for testing or reset purposes)
export function useClearDismissedRequests() {
  return () => {
    localStorage.removeItem(DISMISSED_STORAGE_KEY);
  };
}
