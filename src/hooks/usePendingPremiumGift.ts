import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

export function usePendingPremiumGift() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pending-premium-gift', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data } = await supabase
        .from('gifted_premium')
        .select('id, gifted_by, created_at')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .eq('is_active', false)
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) return null;

      // Get gifter's username
      const { data: gifterProfile } = await supabase
        .from('profiles')
        .select('username')
        .eq('user_id', data.gifted_by)
        .maybeSingle();

      return {
        id: data.id,
        gifterUsername: gifterProfile?.username || 'Someone',
      };
    },
    enabled: !!user?.id,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
