import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';

export interface VybeScoreEvent {
  id: string;
  action: string;
  points: number;
  created_at: string;
}

export function useVybeScore(profileId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['vybe-score', profileId],
    queryFn: async () => {
      if (!profileId) return 0;
      const { data, error } = await supabase
        .from('vybe_scores')
        .select('score')
        .eq('profile_id', profileId)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.score ?? 0);
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });

  // Realtime: tick up live
  useEffect(() => {
    if (!profileId) return;
    const channel = subscribePostgresChannel(`vybe-score:${profileId}`, [
      {
        event: '*',
        table: 'vybe_scores',
        filter: `profile_id=eq.${profileId}`,
        callback: (payload: any) => {
          const next = Number(payload.new?.score ?? 0);
          qc.setQueryData(['vybe-score', profileId], next);
        },
      },
    ]);
    return () => { removeRealtimeChannel(channel); };
  }, [profileId, qc]);

  return query;
}

export function useVybeScoreBreakdown(profileId: string | undefined) {
  const { profile } = useAuth();
  const isOwn = !!profile && profile.id === profileId;

  return useQuery({
    queryKey: ['vybe-score-breakdown', profileId],
    queryFn: async (): Promise<{ today: number; topActions: { action: string; points: number }[] }> => {
      if (!profileId) return { today: 0, topActions: [] };
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from('vybe_score_events')
        .select('action, points, created_at')
        .eq('profile_id', profileId)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const today = (data ?? []).reduce((sum: number, r: any) => sum + (r.points ?? 0), 0);
      const byAction: Record<string, number> = {};
      for (const r of data ?? []) {
        byAction[r.action] = (byAction[r.action] ?? 0) + (r.points ?? 0);
      }
      const topActions = Object.entries(byAction)
        .map(([action, points]) => ({ action, points }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 5);
      return { today, topActions };
    },
    enabled: !!profileId && isOwn, // breakdown visible to owner only (RLS enforced)
    staleTime: 60_000,
  });
}

export function formatVybeScore(n: number): string {
  if (n < 10_000) return new Intl.NumberFormat().format(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '') + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
