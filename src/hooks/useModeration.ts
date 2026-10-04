import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isStaffQueryEnabled } from '@/lib/adminAccess';
import { invokeEdgeFeature } from '@/lib/edgeFeature';
import { isPreviewFounderUser, isFounderAuthId } from '@/lib/previewSandbox';

export type AdminUserRole = 'admin' | 'moderator';

export interface AdminUserRoleRow {
  id: string;
  user_id: string;
  role: AdminUserRole;
  created_at?: string;
  profile: {
    id: string;
    username?: string;
    avatar_url?: string | null;
    display_name?: string | null;
    user_id?: string | null;
  } | null;
}

async function loadProfilesForRoleUserIds(userIds: string[]) {
  const unique = [...new Set(userIds.filter(Boolean))];
  const profiles = new Map<string, AdminUserRoleRow['profile']>();

  for (let i = 0; i < unique.length; i += 10) {
    const chunk = unique.slice(i, i + 10);
    const { data: byProfileId } = await db
      .from('profiles')
      .select('id, username, avatar_url, display_name, user_id')
      .in('id', chunk);
    for (const profile of byProfileId || []) {
      profiles.set(profile.id, profile);
      if (profile.user_id) profiles.set(profile.user_id, profile);
    }
  }

  const unresolved = unique.filter((id) => !profiles.has(id));
  for (let i = 0; i < unresolved.length; i += 10) {
    const chunk = unresolved.slice(i, i + 10);
    const { data: byAuthId } = await db
      .from('profiles')
      .select('id, username, avatar_url, display_name, user_id')
      .in('user_id', chunk);
    for (const profile of byAuthId || []) {
      profiles.set(profile.id, profile);
      if (profile.user_id) profiles.set(profile.user_id, profile);
    }
  }

  return profiles;
}

const ALL_USER_ROLES_KEY = ['all-user-roles'] as const;

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

      // Badges are presentation only, including old imported staff badges.
      // They can never supply a staff role when the role lookup has none.
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
    queryKey: ALL_USER_ROLES_KEY,
    queryFn: async (): Promise<AdminUserRoleRow[]> => {
      const [rolesRes, authRolesRes] = await Promise.all([
        db.from('user_roles').select('*').order('created_at', { ascending: false }),
        db.from('user_roles_auth').select('*').order('created_at', { ascending: false }),
      ]);

      if (rolesRes.error && authRolesRes.error) throw rolesRes.error;

      const merged = new Map<string, { id: string; user_id: string; role: string; created_at?: string }>();
      for (const row of rolesRes.data || []) {
        merged.set(`${row.user_id}_${row.role}`, row);
      }
      for (const row of authRolesRes.data || []) {
        const key = `${row.user_id}_${row.role}`;
        if (!merged.has(key)) merged.set(key, row);
      }

      const roles = Array.from(merged.values());
      const profileIds = [...new Set(roles.map((r) => r.user_id).filter(Boolean))];
      const profiles = await loadProfilesForRoleUserIds(profileIds);

      return roles.map((row) => ({
        ...row,
        role: row.role as AdminUserRole,
        profile: profiles.get(row.user_id) ?? null,
      }));
    },
    staleTime: 30_000,
  });
}

async function upsertRoleRows(profileId: string, authUserId: string | null | undefined, role: AdminUserRole) {
  const now = new Date().toISOString();
  const docId = `${profileId}_${role}`;
  const writes = [
    db.from('user_roles').upsert(
      { id: docId, user_id: profileId, role, created_at: now },
      { onConflict: 'user_id,role' },
    ),
  ];
  if (authUserId && authUserId !== profileId) {
    writes.push(
      db.from('user_roles_auth').upsert(
        { id: `${authUserId}_${role}`, user_id: authUserId, role, created_at: now },
        { onConflict: 'user_id,role' },
      ),
    );
  }
  const results = await Promise.all(writes);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

async function deleteRoleRows(userKeys: string[], role: AdminUserRole) {
  const ids = [...new Set(userKeys.filter(Boolean))];
  const results = await Promise.all(
    ids.flatMap((userId) => [
      db.from('user_roles').delete().eq('user_id', userId).eq('role', role),
      db.from('user_roles_auth').delete().eq('user_id', userId).eq('role', role),
    ]),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

// Mutation to add a role to a user
export function useAddUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      authUserId,
    }: {
      userId: string;
      role: AdminUserRole;
      authUserId?: string | null;
      profile?: AdminUserRoleRow['profile'];
    }) => {
      let resolvedAuthId = authUserId ?? null;
      if (!resolvedAuthId) {
        const { data } = await db.from('profiles').select('user_id').eq('id', userId).maybeSingle();
        resolvedAuthId = data?.user_id ?? null;
      }
      await upsertRoleRows(userId, resolvedAuthId, role);
    },
    onMutate: async ({ userId, role, profile }) => {
      await queryClient.cancelQueries({ queryKey: ALL_USER_ROLES_KEY });
      const previous = queryClient.getQueryData<AdminUserRoleRow[]>(ALL_USER_ROLES_KEY);
      const optimistic: AdminUserRoleRow = {
        id: `${userId}_${role}`,
        user_id: userId,
        role,
        created_at: new Date().toISOString(),
        profile: profile ?? previous?.find((r) => r.user_id === userId)?.profile ?? null,
      };
      queryClient.setQueryData<AdminUserRoleRow[]>(ALL_USER_ROLES_KEY, (old = []) => {
        if (old.some((r) => r.user_id === userId && r.role === role)) return old;
        return [optimistic, ...old];
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ALL_USER_ROLES_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ALL_USER_ROLES_KEY, refetchType: 'none' });
    },
  });
}

// Mutation to remove a role from a user
export function useRemoveUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      role,
      authUserId,
    }: {
      userId: string;
      role: AdminUserRole;
      authUserId?: string | null;
    }) => {
      let resolvedAuthId = authUserId ?? null;
      if (!resolvedAuthId) {
        const { data } = await db.from('profiles').select('user_id').eq('id', userId).maybeSingle();
        resolvedAuthId = data?.user_id ?? null;
      }
      await deleteRoleRows([userId, resolvedAuthId ?? undefined].filter(Boolean) as string[], role);
    },
    onMutate: async ({ userId, role }) => {
      await queryClient.cancelQueries({ queryKey: ALL_USER_ROLES_KEY });
      const previous = queryClient.getQueryData<AdminUserRoleRow[]>(ALL_USER_ROLES_KEY);
      queryClient.setQueryData<AdminUserRoleRow[]>(ALL_USER_ROLES_KEY, (old = []) =>
        old.filter((r) => !(r.user_id === userId && r.role === role)),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(ALL_USER_ROLES_KEY, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ALL_USER_ROLES_KEY, refetchType: 'none' });
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
