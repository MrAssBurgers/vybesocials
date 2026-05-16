import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to fetch a specific user's role by their profile ID
 */
export function useUserRoleById(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-role', userId],
    queryFn: async () => {
      if (!userId) return null;
      
      // Check both user_roles (profile-keyed) and user_roles_auth (auth-keyed)
      const [profileRoles, authRoles] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId),
        supabase.from('user_roles_auth').select('role').eq('user_id', userId),
      ]);
      
      const allRoles = [
        ...((profileRoles.data || []).map(r => r.role)),
        ...((authRoles.data || []).map(r => r.role)),
      ];
      
      if (allRoles.includes('owner')) return 'owner' as const;
      if (allRoles.includes('admin')) return 'admin' as const;
      if (allRoles.includes('moderator')) return 'moderator' as const;
      return null;
    },
    enabled: !!userId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

/**
 * Hook to fetch multiple users' roles at once for efficiency
 */
export function useUsersRoles(userIds: string[]) {
  return useQuery({
    queryKey: ['users-roles', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', userIds);
      
      if (error) {
        // Non-critical for the DM list. During slow/offline auth restore this can run
        // with an anonymous token; return no badges instead of breaking chat rendering.
        if (error.code === '42501' || error.code === 'PGRST116') return {};
        throw error;
      }
      
      // Build a map of userId -> highest role
      const roleMap: Record<string, 'admin' | 'moderator' | 'owner' | null> = {};
      
      for (const row of data || []) {
        const current = roleMap[row.user_id];
        if (row.role === 'owner') {
          roleMap[row.user_id] = 'owner';
        } else if (row.role === 'admin' && current !== 'owner') {
          roleMap[row.user_id] = 'admin';
        } else if (row.role === 'moderator' && current !== 'admin' && current !== 'owner') {
          roleMap[row.user_id] = 'moderator';
        }
      }
      
      return roleMap;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 1000 * 60 * 60 * 24 * 14,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    networkMode: 'offlineFirst',
  });
}
