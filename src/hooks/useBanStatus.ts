import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export const useBanStatus = () => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['ban-status', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('user_bans')
        .select('*, is_meme_ban')
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
    refetchInterval: 60000,
  });
};
