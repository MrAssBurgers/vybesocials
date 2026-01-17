import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useState, useEffect } from 'react';

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

// In-memory dismissed set for current session only
// This allows the notification to appear again on new sessions
const sessionDismissedRequests = new Set<string>();

// Fetch recently accepted friend requests (where current user was the sender)
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

      // Filter out only session-dismissed ones (not localStorage)
      const filtered = (data || []).filter(r => !sessionDismissedRequests.has(r.id));

      return filtered as AcceptedFriendRequest[];
    },
    enabled: !!profile?.id,
    staleTime: 30000, // Refetch more often to catch new acceptances
    refetchOnWindowFocus: true,
  });
}

export function useDismissAcceptedRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Only dismiss for current session
      sessionDismissedRequests.add(requestId);

      return requestId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accepted-friend-requests'] });
    },
  });
}

// Hook to clear dismissed requests (call on logout or when appropriate)
export function useClearDismissedRequests() {
  return () => {
    sessionDismissedRequests.clear();
  };
}
