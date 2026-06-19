import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { pickActiveBan } from '@/lib/banUtils';

export const useBanStatus = () => {
  const profileId = useAuthProfileId();

  // Realtime ban updates are handled once in auth.tsx (ban-status-${profileId}).
  return useQuery({
    queryKey: ['ban-status', profileId],
    queryFn: async () => {
      if (!profileId) return null;

      const { data, error } = await db
        .from('user_bans')
        .select('*, is_meme_ban, custom_gif_url')
        .eq('user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error checking ban status:', error);
        return null;
      }

      return pickActiveBan(data ?? []);
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
