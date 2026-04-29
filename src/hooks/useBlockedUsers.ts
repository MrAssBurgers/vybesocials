import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Returns the set of profile IDs the current user has blocked.
 * Used to client-filter feeds since several feed RPCs don't accept a viewer ID.
 */
export function useBlockedUserIds() {
  const { profile } = useAuth();

  const { data } = useQuery({
    queryKey: ['blocked-user-ids', profile?.id],
    queryFn: async (): Promise<string[]> => {
      if (!profile?.id) return [];
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocked_id')
        .eq('blocker_id', profile.id);
      if (error) {
        console.warn('[useBlockedUserIds] failed', error);
        return [];
      }
      return (data || []).map((r: any) => r.blocked_id).filter(Boolean);
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  return data || [];
}
