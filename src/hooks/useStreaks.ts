import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

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
  const profileId = useAuthProfileId();

  const query = useQuery({
    queryKey: ['streaks', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('streaks')
        .select(`
          *,
          user1:profiles!user1_id(id, username, avatar_url, display_name),
          user2:profiles!user2_id(id, username, avatar_url, display_name)
        `)
        .or(`user1_id.eq.${profileId},user2_id.eq.${profileId}`)
        .gt('expires_at', new Date().toISOString())
        .order('streak_count', { ascending: false });

      if (error) throw error;
      return (data || []) as Streak[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 30000,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  return query;
}

export function useStreakWithUser(otherUserId: string | undefined) {
  const { data: streaks } = useStreaks();
  const profileId = useAuthProfileId();

  return useMemo(() => {
    if (!streaks || !profileId || !otherUserId) return null;

    return streaks.find(
      (s) =>
        (s.user1_id === profileId && s.user2_id === otherUserId) ||
        (s.user2_id === profileId && s.user1_id === otherUserId)
    );
  }, [streaks, profileId, otherUserId]);
}

export function useStreakMap() {
  const { data: streaks } = useStreaks();
  const profileId = useAuthProfileId();

  return useMemo(() => {
    const map = new Map<string, Streak>();
    if (!streaks || !profileId) return map;

    streaks.forEach((streak) => {
      const otherUserId =
        streak.user1_id === profileId ? streak.user2_id : streak.user1_id;
      map.set(otherUserId, streak);
    });

    return map;
  }, [streaks, profileId]);
}

export function isStreakExpiringSoon(expiresAt: string): boolean {
  const hoursLeft = Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
  );
  return hoursLeft <= 3;
}

export function getStreakHoursLeft(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60))
  );
}
