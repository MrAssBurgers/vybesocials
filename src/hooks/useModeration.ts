import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { getFunctionAuthHeaders } from '@/lib/functionAuth';

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
  post_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_notes: string | null;
  created_at: string;
  reporter?: { username: string; avatar_url: string | null };
  post?: { caption: string | null; media_url: string };
}

export function useContentFlags() {
  return useQuery({
    queryKey: ['content-flags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('content_flags')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ContentFlag[];
    },
  });
}

export function useReports() {
  return useQuery({
    queryKey: ['admin-reports'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          *,
          reporter:profiles!reports_reporter_id_fkey(username, avatar_url),
          post:posts!reports_post_id_fkey(caption, media_url)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Report[];
    },
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
      const { error } = await supabase
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
      const { error } = await supabase
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
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['user-role', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', profile.id);

      if (error) throw error;

      // Return highest role (admin > moderator > user)
      const roles = (data || []).map((r) => r.role);
      if (roles.includes('admin')) return 'admin';
      if (roles.includes('moderator')) return 'moderator';
      return null;
    },
    enabled: !!profile?.id,
    staleTime: 60 * 1000,
  });
}

// Hook to get all user roles for admin management
export function useAllUserRoles() {
  return useQuery({
    queryKey: ['all-user-roles'],
    queryFn: async () => {
      const { data, error } = await supabase
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
      const { error } = await supabase
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
      const { error } = await supabase
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
    const headers = await getFunctionAuthHeaders();
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moderate-content`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ content, content_type: contentType, content_id: contentId }),
      }
    );

    if (!response.ok) {
      console.error('Moderation API error:', response.status);
      return { allowed: true, score: 0, requires_review: false };
    }

    return await response.json();
  } catch (error) {
    console.error('Moderation error:', error);
    return { allowed: true, score: 0, requires_review: false };
  }
}
