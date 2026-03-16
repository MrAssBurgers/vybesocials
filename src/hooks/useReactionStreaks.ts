import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface ReactionStreak {
  id: string;
  user_a: string;
  user_b: string;
  current_streak: number;
  longest_streak: number;
  last_interaction_at: string;
  streak_started_at: string;
  partner?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useReactionStreaks() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['reaction-streaks', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('reaction_streaks' as any)
        .select('*')
        .or(`user_a.eq.${profile.id},user_b.eq.${profile.id}`)
        .gt('current_streak', 0)
        .order('current_streak', { ascending: false });

      if (error) throw error;

      const rows = (data || []) as any[];
      const partnerIds = rows.map((row) => row.user_a === profile.id ? row.user_b : row.user_a);

      if (partnerIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', partnerIds);

      const profileMap = new Map((profiles || []).map((item) => [item.id, item]));

      return rows.map((row) => ({
        ...row,
        partner: profileMap.get(row.user_a === profile.id ? row.user_b : row.user_a) || null,
      })) as ReactionStreak[];
    },
    enabled: !!profile?.id,
    staleTime: 30_000,
  });
}

export function useBumpReactionStreak() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('bump_reaction_streak', {
        p_other_user: otherUserId,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reaction-streaks', profile?.id] });
    },
  });
}
