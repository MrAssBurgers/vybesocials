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
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      if (error && error.code !== 'PGRST116') throw error;
      
      const roles = (data || []).map((r) => r.role);
      if (roles.includes('admin')) return 'admin' as const;
      if (roles.includes('moderator')) return 'moderator' as const;
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
      
      if (error && error.code !== 'PGRST116') throw error;
      
      // Build a map of userId -> highest role
      const roleMap: Record<string, 'admin' | 'moderator' | null> = {};
      
      for (const row of data || []) {
        const current = roleMap[row.user_id];
        if (row.role === 'admin') {
          roleMap[row.user_id] = 'admin';
        } else if (row.role === 'moderator' && current !== 'admin') {
          roleMap[row.user_id] = 'moderator';
        }
      }
      
      return roleMap;
    },
    enabled: userIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}
