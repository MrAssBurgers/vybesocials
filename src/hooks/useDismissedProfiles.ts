import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Hook to manage permanently dismissed/hidden profiles
 * Profiles that are dismissed will never appear in discovery, suggestions, or search
 */
export function useDismissedProfiles() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['dismissed-profiles', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return new Set<string>();

      const { data, error } = await supabase
        .from('dismissed_profiles')
        .select('dismissed_user_id')
        .eq('user_id', profile.id);

      if (error) {
        console.error('[useDismissedProfiles] Error:', error);
        return new Set<string>();
      }

      return new Set(data.map(d => d.dismissed_user_id));
    },
    enabled: !!profile?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

/**
 * Hook to dismiss a profile permanently
 */
export function useDismissProfile() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dismissedUserId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dismissed_profiles')
        .insert({
          user_id: profile.id,
          dismissed_user_id: dismissedUserId,
        });

      if (error && error.code !== '23505') { // Ignore duplicate key errors
        throw error;
      }

      return dismissedUserId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dismissed-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
    },
  });
}

/**
 * Hook to undismiss a profile
 */
export function useUndismissProfile() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dismissedUserId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dismissed_profiles')
        .delete()
        .eq('user_id', profile.id)
        .eq('dismissed_user_id', dismissedUserId);

      if (error) throw error;

      return dismissedUserId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dismissed-profiles'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-with-mutuals'] });
      queryClient.invalidateQueries({ queryKey: ['suggested-users'] });
    },
  });
}

/**
 * Hook to get list of dismissed profiles with full profile data
 */
export function useDismissedProfilesList() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['dismissed-profiles-list', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('dismissed_profiles')
        .select(`
          id,
          created_at,
          dismissed_user:profiles!dismissed_user_id(
            id,
            username,
            display_name,
            avatar_url,
            first_name,
            last_name
          )
        `)
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useDismissedProfilesList] Error:', error);
        return [];
      }

      return data;
    },
    enabled: !!profile?.id,
  });
}
