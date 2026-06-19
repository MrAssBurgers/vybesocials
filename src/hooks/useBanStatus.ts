import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { pickActiveBan } from '@/lib/banUtils';
import { isFirestoreIndexError, isPermissionDeniedError, warnOnce } from '@/lib/logOnce';

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
        .eq('user_id', profileId);

      if (error) {
        if (isPermissionDeniedError(error) || isFirestoreIndexError(error)) {
          warnOnce('ban-status-fetch', 'Error checking ban status:', error);
        } else {
          console.error('Error checking ban status:', error);
        }
        return null;
      }

      const rows = [...(data ?? [])].sort(
        (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
      );

      return pickActiveBan(rows.slice(0, 10));
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
