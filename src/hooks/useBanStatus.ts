import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export const useBanStatus = () => {
  const profileId = useAuthProfileId();

  // Realtime ban updates are handled once in auth.tsx (ban-status-${profileId}).
  return useQuery({
    queryKey: ['ban-status', profileId],
    queryFn: async () => {
      if (!profileId) return null;

      const { data, error } = await supabase
        .from('user_bans')
        .select('*, is_meme_ban, custom_gif_url')
        .eq('user_id', profileId)
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
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 0,
    gcTime: 0,
    refetchInterval: false,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
};
