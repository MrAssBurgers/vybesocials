import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

/**
 * Hook to manage permanently dismissed/hidden profiles
 * Profiles that are dismissed will never appear in discovery, suggestions, or search
 */
export function useDismissedProfiles() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['dismissed-profiles', profileId],
    queryFn: async () => {
      if (!profileId) return new Set<string>();

      const { data, error } = await supabase
        .from('dismissed_profiles')
        .select('dismissed_user_id')
        .eq('user_id', profileId);

      if (error) {
        console.error('[useDismissedProfiles] Error:', error);
        return new Set<string>();
      }

      return new Set(data.map(d => d.dismissed_user_id));
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    networkMode: 'always',
  });
}

/**
 * Hook to dismiss a profile permanently
 */
export function useDismissProfile() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dismissedUserId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dismissed_profiles')
        .insert({
          user_id: profileId,
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
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dismissedUserId: string) => {
      if (!profileId) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('dismissed_profiles')
        .delete()
        .eq('user_id', profileId)
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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['dismissed-profiles-list', profileId],
    queryFn: async () => {
      if (!profileId) return [];

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
        .eq('user_id', profileId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useDismissedProfilesList] Error:', error);
        return [];
      }

      return data;
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}
