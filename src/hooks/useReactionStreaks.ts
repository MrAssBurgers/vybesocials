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
  const { user } = useAuth();

  return useQuery({
    queryKey: ['reaction-streaks', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('reaction_streaks' as any)
        .select('*')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .gt('current_streak', 0)
        .order('current_streak', { ascending: false });

      if (error) throw error;

      // Fetch partner profiles
      const rows = (data || []) as any[];
      const partnerIds = rows.map(r => r.user_a === user.id ? r.user_b : r.user_a);
      
      if (partnerIds.length === 0) return [];

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .in('id', partnerIds);

      const profileMap = new Map((profiles || []).map(p => [p.id, p]));

      return rows.map(r => ({
        ...r,
        partner: profileMap.get(r.user_a === user.id ? r.user_b : r.user_a) || null,
      })) as ReactionStreak[];
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });
}

export function useBumpReactionStreak() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (otherUserId: string) => {
      const { data, error } = await supabase.rpc('bump_reaction_streak', {
        p_other_user: otherUserId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reaction-streaks', user?.id] });
    },
  });
}
