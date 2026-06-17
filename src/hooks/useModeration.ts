import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isStaffQueryEnabled } from '@/lib/adminAccess';
import { invokeEdgeFeature } from '@/lib/edgeFeature';
import { isPreviewFounderUser, isFounderAuthId } from '@/lib/previewSandbox';

export interface ContentFlag {
  id: string;
  content_type: string;
  content_id: string;
  flagged_text: string | null;
  ai_score: number | null;
  ai_categories: Record<string, boolean> | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface Report {
  id: string;
  post_id: string | null;
  reported_user_id: string | null;
  reporter_id: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  reporter?: { username: string; avatar_url: string | null };
  reported_user?: { username: string; avatar_url: string | null } | null;
  post?: { caption: string | null; media_url: string } | null;
}

export function useContentFlags() {
  const { user, authReady } = useAuth();
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['content-flags'],
    queryFn: async () => {
      const { data, error } = await db
        .from('content_flags')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContentFlag[];
    },
    enabled: isStaffQueryEnabled(authReady, user, profileId),
    networkMode: 'always',
  });
}

export function useReports() {
  const { user, authReady } = useAuth();
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data, error } = await db
        .from('reports')
        .select(`
          *,
          reporter:profiles!reports_reporter_id_fkey(username, avatar_url),
          reported_user:profiles!reports_reported_user_id_fkey(username, avatar_url),
          post:posts!reports_post_id_fkey(caption, media_url)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Report[];
    },
    enabled: isStaffQueryEnabled(authReady, user, profileId),
    networkMode: 'always',
  });
}

export function useUpdateFlag() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      reviewed_by 
    }: { 
      id: string; 
      status: 'approved' | 'rejected'; 
      reviewed_by: string;
    }) => {
      const { error } = await db
        .from('content_flags')
        .update({ 
          status, 
          reviewed_by, 
          reviewed_at: new Date().toISOString() 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-flags'] });
    },
  });
}

export function useUpdateReport() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ 
      id, 
      status, 
      reviewed_by,
      admin_notes 
    }: { 
      id: string; 
      status: 'reviewed' | 'dismissed' | 'actioned'; 
      reviewed_by: string;
      admin_notes?: string;
    }) => {
      const { error } = await db
        .from('reports')
        .update({ 
          status, 
          reviewed_by, 
          reviewed_at: new Date().toISOString(),
          admin_notes 
        })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reports'] });
    },
  });
}

export function useUserRole() {
  const { user, authReady } = useAuth();
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['user-role', profileId, user?.id],
    queryFn: async () => {
      if (!profileId && !user?.id) return null;

      if (isFounderAuthId(user?.id) || isPreviewFounderUser(user)) {
        return 'owner' as const;
      }

      // 1) Authoritative path: SECURITY DEFINER RPC bypasses any RLS edge cases
      try {
        const { data: rpcRole, error: rpcErr } = await db.rpc('get_my_highest_role');
        if (!rpcErr && rpcRole) {
          return rpcRole as 'owner' | 'admin' | 'moderator';
        }
      } catch {
        // fall through to table queries
      }

      // 2) Fallback: query both role tables directly (may be hidden by RLS)
      const [profileRoles, authRoles] = await Promise.all([
        profileId
          ? db.from('user_roles').select('role').eq('user_id', profileId)
          : Promise.resolve({ data: [], error: null }),
        user?.id
          ? db.from('user_roles_auth').select('role').eq('user_id', user.id)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const roles = [
        ...((profileRoles.data || []).map((r: any) => r.role)),
        ...((authRoles.data || []).map((r: any) => r.role)),
      ];
      if (roles.includes('owner') || roles.includes('owner_wife')) return 'owner';
      if (roles.includes('admin')) return 'admin';
      if (roles.includes('moderator')) return 'moderator';

      // 3) Badge-based fallback: anyone who has been awarded an Owner / Admin /
      //    Moderator badge gets the matching effective role so they immediately
      //    see the admin panel (covers users granted via badges only).
      if (profileId) {
        const { data: badgeRows } = await db
          .from('user_badges')
          .select('badge_name, badge_type')
          .eq('user_id', profileId);
        const names = (badgeRows || []).map((b: any) => String(b.badge_name || '').toLowerCase());
        if (names.includes('owner') || names.includes("owner's wife")) return 'owner';
        if (names.includes('admin')) return 'admin';
        if (names.includes('moderator')) return 'moderator';
      }

      return null;
    },
    enabled: authReady && (!!profileId || !!user?.id),
    staleTime: 60 * 1000,
    retry: 2,
    networkMode: 'always',
  });
}

// Hook to get all user roles for admin management
export function useAllUserRoles() {
  return useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await db
        .from('user_roles')
        .select(`
          *,
          profile:profiles!user_id(id, username, avatar_url, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data || [];
    },
  });
}

// Mutation to add a role to a user
export function useAddUserRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'moderator' }) => {
      const { error } = await db
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

// Mutation to remove a role from a user
export function useRemoveUserRole() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: 'admin' | 'moderator' }) => {
      const { error } = await db
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-user-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });
}

export async function moderateContent(
  content: string, 
  contentType: 'post' | 'comment' | 'message' | 'profile',
  contentId: string
): Promise<{ allowed: boolean; score: number; requires_review: boolean }> {
  try {
    const { data, unavailable } = await invokeEdgeFeature<{
      allowed?: boolean;
      safe?: boolean;
      score?: number;
      requires_review?: boolean;
    }>('moderate-content', { content, content_type: contentType, content_id: contentId });

    if (unavailable || !data) {
      return { allowed: true, score: 0, requires_review: false };
    }

    return {
      allowed: data.allowed ?? data.safe !== false,
      score: Number(data.score || 0),
      requires_review: !!data.requires_review,
    };
  } catch (error) {
    console.error('Moderation error:', error);
    return { allowed: true, score: 0, requires_review: false };
  }
}
