import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function useCreatorProfile() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['creator-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });
}

export function useApplyForPartner() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('creator_profiles')
        .upsert({
          user_id: user.id,
          applied_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-profile'] });
      toast.success('Application submitted! We\'ll review it shortly.');
    },
    onError: () => toast.error('Failed to apply. Try again.'),
  });
}

export function useCreatorEarnings(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-earnings', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await supabase
        .from('creator_earnings')
        .select('*')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useCreatorDailyStats(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-daily-stats', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await supabase
        .from('creator_daily_stats')
        .select('*')
        .eq('creator_id', creatorId)
        .order('stat_date', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useCreatorPayouts(creatorId: string | undefined) {
  return useQuery({
    queryKey: ['creator-payouts', creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await supabase
        .from('creator_payouts')
        .select('*')
        .eq('creator_id', creatorId)
        .order('requested_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!creatorId,
  });
}

export function useRequestPayout() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ creatorId, amount }: { creatorId: string; amount: number }) => {
      const { data, error } = await supabase
        .from('creator_payouts')
        .insert({ creator_id: creatorId, amount })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creator-payouts'] });
      qc.invalidateQueries({ queryKey: ['creator-profile'] });
      toast.success('Payout requested!');
    },
    onError: () => toast.error('Failed to request payout.'),
  });
}
