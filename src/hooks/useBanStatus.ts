import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';

export const useBanStatus = () => {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // Real-time subscription for instant ban detection
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`ban-status-${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_bans',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          // Instantly invalidate ban status on any change
          queryClient.invalidateQueries({ queryKey: ['ban-status', profile.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return useQuery({
    queryKey: ['ban-status', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('user_bans')
        .select('*, is_meme_ban, custom_gif_url')
        .eq('user_id', profile.id)
        .or(`is_permanent.eq.true,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking ban status:', error);
        return null;
      }

      return data;
    },
    enabled: !!profile?.id,
    staleTime: 10 * 60 * 1000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
};
