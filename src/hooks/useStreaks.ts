import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface Streak {
  id: string;
  user1_id: string;
  user2_id: string;
  streak_count: number;
  last_message_at: string;
  expires_at: string;
  created_at: string;
  user1?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  user2?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useStreaks() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['streaks', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Only fetch active (non-expired) streaks
      const { data, error } = await supabase
        .from('streaks')
        .select(`
          *,
          user1:profiles!user1_id(id, username, avatar_url, display_name),
          user2:profiles!user2_id(id, username, avatar_url, display_name)
        `)
        .or(`user1_id.eq.${profile.id},user2_id.eq.${profile.id}`)
        .gt('expires_at', new Date().toISOString()) // Only active streaks
        .order('streak_count', { ascending: false });

      if (error) throw error;
      return (data || []) as Streak[];
    },
    enabled: !!profile?.id,
    staleTime: 30000,
  });

  // Set up realtime subscription for streak updates
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('streaks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streaks',
          filter: `user1_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['streaks'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streaks',
          filter: `user2_id=eq.${profile.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['streaks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return query;
}

// Hook to get streak with a specific user
export function useStreakWithUser(otherUserId: string | undefined) {
  const { data: streaks } = useStreaks();
  const { profile } = useAuth();

  return useMemo(() => {
    if (!streaks || !profile?.id || !otherUserId) return null;

    return streaks.find(
      (s) =>
        (s.user1_id === profile.id && s.user2_id === otherUserId) ||
        (s.user2_id === profile.id && s.user1_id === otherUserId)
    );
  }, [streaks, profile?.id, otherUserId]);
}

// Hook to get a map of user IDs to their streak data for quick lookup
export function useStreakMap() {
  const { data: streaks } = useStreaks();
  const { profile } = useAuth();

  return useMemo(() => {
    const map = new Map<string, Streak>();
    if (!streaks || !profile?.id) return map;

    streaks.forEach((streak) => {
      // Get the other user's ID
      const otherUserId =
        streak.user1_id === profile.id ? streak.user2_id : streak.user1_id;
      map.set(otherUserId, streak);
    });

    return map;
  }, [streaks, profile?.id]);
}

// Utility function to check if streak is expiring soon (within 3 hours)
export function isStreakExpiringSoon(expiresAt: string): boolean {
  const hoursLeft = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
  );
  return hoursLeft <= 3;
}

// Utility function to get hours left until streak expires
export function getStreakHoursLeft(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
  );
}
